import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { withFlatPrices } from "@/lib/utils";
import { verifyToken } from "@/lib/auth";

const SORTS = ["popularity", "price_asc", "price_desc", "name"] as const;
type Sort = (typeof SORTS)[number];

/** Скрывает оптовые цены от незарегистрированных пользователей */
function maskGuestPrices(product: any) {
  const { wholesalePrice, bigWholesalePrice, prices, ...rest } = product;
  return { ...rest, prices: [] };
}

/**
 * Wholesale prices and «sale» guids for the whole catalog, kept for 2 minutes.
 * Price sort / price range / sale used to send IN-lists of ~12k guids to the DB
 * on every page; one cached pass over ProductPrice is far cheaper.
 */
type PriceIndex = { at: number; wholesale: Map<string, number>; sale: Set<string> };
let priceMemo: PriceIndex | null = null;
let priceMemoLoading: Promise<PriceIndex> | null = null;
async function priceIndex(): Promise<PriceIndex> {
  if (priceMemo && Date.now() - priceMemo.at < 120_000) return priceMemo;
  if (!priceMemoLoading) {
    priceMemoLoading = prisma.productPrice
      .findMany({ where: { priceType: { in: ["wholesale", "discount"] } }, select: { productGuid: true, priceType: true, price: true } })
      .then((rows) => {
        const wholesale = new Map<string, number>();
        const sale = new Set<string>();
        for (const r of rows) {
          if (r.priceType === "wholesale") wholesale.set(r.productGuid, r.price);
          else sale.add(r.productGuid);
        }
        const next: PriceIndex = { at: Date.now(), wholesale, sale };
        priceMemo = next;
        return next;
      })
      .finally(() => {
        priceMemoLoading = null;
      });
  }
  return priceMemoLoading;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Проверяем авторизацию
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  const payload = token ? await verifyToken(token) : null;
  const isAuthenticated = Boolean(payload?.id);

  const page = Number(searchParams.get("page") || 1);
  const limit = 40;

  const categoryGuids = searchParams.getAll("categoryGuid").filter(Boolean);
  const brandGuids = searchParams.getAll("brandGuid").filter(Boolean);
  const search = searchParams.get("search");
  // Product-type filter of the mobile app («Мисты», «Спреи»…): the name contains
  // any of these fragments. Combined with everything else via AND.
  const nameAny = searchParams
    .getAll("nameAny")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 20);
  const onlyStock = searchParams.get("onlyStock") === "true";

  const priceMinParam = searchParams.get("priceMin");
  const priceMaxParam = searchParams.get("priceMax");
  const priceMin = priceMinParam ? Number(priceMinParam) : null;
  const priceMax = priceMaxParam ? Number(priceMaxParam) : null;

  // "new" | "sale" | "gift" — can combine several at once
  const quick = searchParams.getAll("quick").filter(Boolean);

  const sortParam = searchParams.get("sort") as Sort | null;
  const sort: Sort = SORTS.includes(sortParam as Sort)
    ? (sortParam as Sort)
    : "popularity";

  const newSince = new Date();
  newSince.setDate(newSince.getDate() - 30);

  const where: any = {
    ...(categoryGuids.length > 0 ? { categoryGuid: { in: categoryGuids } } : {}),
    ...(brandGuids.length > 0 ? { brandGuid: { in: brandGuids } } : {}),
    ...(onlyStock ? { stock: { gt: 0 } } : {}),
    ...(quick.includes("new") ? { createdAt: { gte: newSince } } : {}),
    ...(quick.includes("gift")
      ? { name: { contains: "Подарок", mode: "insensitive" } }
      : {}),
    ...(nameAny.length > 0
      ? { AND: [{ OR: nameAny.map((s) => ({ name: { contains: s, mode: "insensitive" } })) }] }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search } },
            { article: { contains: search } },
          ],
        }
      : {}),
  };

  const include = {
    category: true,
    brand: true,
    images: { take: 1 },
    prices: true,
  };
  // ?lite=1 (mobile apps): no description — it is ~65% of the page and cards don't show it
  const omit = searchParams.get("lite") === "1" ? { description: true } : undefined;

  const applyPrices = (product: any) => {
    const flat = withFlatPrices(product);
    return isAuthenticated ? flat : maskGuestPrices(flat);
  };

  // Prices live in a separate ProductPrice relation, so they can only be
  // filtered/sorted by loading them into memory — that's expensive on a
  // big catalog. Only pay that cost when the request actually needs it
  // (a price filter, price sort, or the "sale" quick filter); everything
  // else uses a plain, cheap, DB-paginated query.
  const needsPriceJoin =
    priceMin !== null ||
    priceMax !== null ||
    quick.includes("sale") ||
    sort === "price_asc" ||
    sort === "price_desc";

  if (!needsPriceJoin) {
    const orderBy =
      sort === "name"
        ? { name: "asc" as const }
        : quick.includes("new")
        ? { createdAt: "desc" as const }
        : { updatedAt: "desc" as const }; // popularity: recently restocked/updated first

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include,
        omit,
        orderBy,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      nameAnyApplied: nameAny.length > 0,
      products: products.map(applyPrices),
      total,
      page,
      hasMore: page * limit < total,
    });
  }

  // Price-aware path: push price range and sale filters down to the DB
  // by pre-fetching eligible guids from ProductPrice, then adding them as
  // a guid-IN constraint on the main product query.
  //
  // Only price SORT still requires an in-memory sort step (because the sort
  // key lives in a separate relation), but even then the candidate set is
  // already price-filtered before it reaches memory.

  // ── Steps 1–3: price range / sale → guid constraint (from the cached index) ──
  const prices = await priceIndex();
  if (priceMin !== null || priceMax !== null || quick.includes("sale")) {
    const merged: string[] = [];
    for (const [guid, price] of prices.wholesale) {
      if (priceMin !== null && price < priceMin) continue;
      if (priceMax !== null && price > priceMax) continue;
      if (quick.includes("sale") && !prices.sale.has(guid)) continue;
      merged.push(guid);
    }
    // sale without a price range: products with a discount but no wholesale price count too
    if (quick.includes("sale") && priceMin === null && priceMax === null) {
      for (const guid of prices.sale) if (!prices.wholesale.has(guid)) merged.push(guid);
    }
    where.guid = { in: merged };
  }

  // ── Step 4a: no price sort → fully DB-paginated ──────────────────────────
  const needsPriceSort = sort === "price_asc" || sort === "price_desc";

  if (!needsPriceSort) {
    const orderBy =
      sort === "name"
        ? { name: "asc" as const }
        : quick.includes("new")
        ? { createdAt: "desc" as const }
        : { updatedAt: "desc" as const };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include,
        omit,
        orderBy,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      nameAnyApplied: nameAny.length > 0,
      products: products.map(applyPrices),
      total,
      page,
      hasMore: page * limit < total,
    });
  }

  // ── Step 4b: price sort → lightweight in-memory sort, but only on the
  //            already price-filtered candidate set ─────────────────────────
  // Safety cap: even though we only fetch id+guid, guard against runaway
  // catalogs (100k+ SKUs) that could consume significant memory.
  const MAX_SORT_CANDIDATES = 10_000;
  const matched = await prisma.product.findMany({
    where,
    select: { id: true, guid: true },
    take: MAX_SORT_CANDIDATES,
  });

  if (matched.length === 0) {
    return NextResponse.json({ nameAnyApplied: nameAny.length > 0, products: [], total: 0, page, hasMore: false });
  }

  const priceByGuid = prices.wholesale;

  matched.sort((a, b) => {
    const pa = priceByGuid.get(a.guid) ?? Infinity;
    const pb = priceByGuid.get(b.guid) ?? Infinity;
    return sort === "price_asc" ? pa - pb : pb - pa;
  });

  const total = matched.length;
  const pageIds = matched.slice((page - 1) * limit, page * limit).map((p) => p.id);

  const products = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include,
    omit,
  });

  const productById = new Map(products.map((p) => [p.id, p]));
  const ordered = pageIds
    .map((id) => productById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return NextResponse.json({
    nameAnyApplied: nameAny.length > 0,
    products: ordered.map(applyPrices),
    total,
    page,
    hasMore: page * limit < total,
  });
}
