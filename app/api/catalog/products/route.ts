import { NextResponse } from "next/server";
import { productSearchWhere } from "@/lib/productSearch";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { relatedIds } from "@/lib/related";
import { customerStock, guestStock, isWholesaleType, withFlatPrices } from "@/lib/utils";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { verifyToken } from "@/lib/auth";
import { createHash } from "crypto";
import { resolveCustomerPriceType, type PriceType } from "@/lib/pricing";
import { pricingCustomer } from "@/lib/siteMode";

const SORTS = ["popularity", "price_asc", "price_desc", "name"] as const;
type Sort = (typeof SORTS)[number];

/** Скрывает оптовые цены от незарегистрированных пользователей */
function maskGuestPrices(product: any) {
  const { wholesalePrice, bigWholesalePrice, prices, ...rest } = product;
  return { ...rest, prices: [], stock: guestStock(product.stock) };
}

/**
 * Wholesale prices and «sale» guids for the whole catalog, kept for 2 minutes.
 * Price sort / price range / sale used to send IN-lists of ~12k guids to the DB
 * on every page; one cached pass over ProductPrice is far cheaper.
 */
type PriceIndex = {
  at: number;
  wholesale: Map<string, number>;
  retail: Map<string, number>;
  discount: Map<string, number>;
  big: Map<string, number>;
  sale: Set<string>;
  /** the price each kind of viewer sees (see shownPrices), built on first use */
  shown: Map<PriceType, Map<string, number>>;
};
let priceMemo: PriceIndex | null = null;
/** Price-sorted product ids per filter set (see the price sort below), max 100 entries, 1 min. */
const sortedMemo = new Map<string, { at: number; ids: number[] }>();
let priceMemoLoading: Promise<PriceIndex> | null = null;
async function priceIndex(): Promise<PriceIndex> {
  if (priceMemo && Date.now() - priceMemo.at < 120_000) return priceMemo;
  if (!priceMemoLoading) {
    priceMemoLoading = prisma.productPrice
      .findMany({ where: { priceType: { in: ["wholesale", "discount", "retail", "big_wholesale"] } }, select: { productGuid: true, priceType: true, price: true } })
      .then((rows) => {
        const wholesale = new Map<string, number>();
        const retail = new Map<string, number>();
        const discount = new Map<string, number>();
        const big = new Map<string, number>();
        const sale = new Set<string>();
        for (const r of rows) {
          if (r.priceType === "wholesale") wholesale.set(r.productGuid, r.price);
          else if (r.priceType === "retail") retail.set(r.productGuid, r.price);
          else if (r.priceType === "big_wholesale") big.set(r.productGuid, r.price);
          else {
            sale.add(r.productGuid);
            discount.set(r.productGuid, r.price);
          }
        }
        const next: PriceIndex = { at: Date.now(), wholesale, retail, discount, big, sale, shown: new Map() };
        priceMemo = next;
        return next;
      })
      .finally(() => {
        priceMemoLoading = null;
      });
  }
  return priceMemoLoading;
}

/**
 * Default order of the catalogue: «ходовые» (most sold in 90 days) first, then recently updated.
 * Whatever the sort, products in stock come first and the ones out of stock at the very end:
 * the in-stock part is paged first, then the rest.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageInStockFirst(where: any, orderBy: any[], page: number, limit: number, include: any, omit: any, wholesale = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const find = (w: any, skip: number, take: number) => (take > 0 ? prisma.product.findMany({ where: w, skip, take, include, omit, orderBy }) : Promise.resolve([]));
  if (where.stock || where.wholesaleStock) {
    const [products, total] = await Promise.all([find(where, (page - 1) * limit, limit), prisma.product.count({ where })]);
    return { products, total };
  }
  // wholesalers: in stock = what they may order (the shop minus its 12 + the warehouse)
  const inWhere = { AND: [where, wholesale ? { wholesaleStock: { gt: 0 } } : { stock: { gt: 0 } }] };
  const outWhere = { AND: [where, wholesale ? { wholesaleStock: { lte: 0 } } : { OR: [{ stock: { lte: 0 } }, { stock: null }] }] };
  const [inCount, outCount] = await Promise.all([prisma.product.count({ where: inWhere }), prisma.product.count({ where: outWhere })]);
  const offset = (page - 1) * limit;
  const first = offset < inCount ? await find(inWhere, offset, limit) : [];
  const rest = await find(outWhere, Math.max(0, offset - inCount), limit - first.length);
  return { products: [...first, ...rest], total: inCount + outCount };
}

/**
 * The price a viewer sees on the cards — the same chain as priceFor (lib/pricing.ts): the price range
 * and the price sort go by it, so «до 500 ₽» shows what costs up to 500 ₽ for him. Guests see the
 * card price (discount → retail), never the wholesale one.
 */
function shownPrices(idx: PriceIndex, type: PriceType): Map<string, number> {
  const hit = idx.shown.get(type);
  if (hit) return hit;
  const chain =
    type === "retail" ? [idx.retail]
    : type === "guest" || type === "discount" ? [idx.discount, idx.retail]
    : type === "big_wholesale" ? [idx.big, idx.wholesale, idx.retail]
    : [idx.wholesale, idx.retail];
  const out = new Map<string, number>();
  for (const m of chain) {
    for (const [guid, price] of m) if (!out.has(guid) && price > 0) out.set(guid, price);
  }
  idx.shown.set(type, out);
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Проверяем авторизацию
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  const payload = token ? await verifyCustomerToken(token) : null;
  // staff (admin / Team app, admin_token) browse the same catalogue with real prices
  const staffToken = payload?.id ? null : cookieStore.get("admin_token")?.value;
  const staff = staffToken ? await verifyToken(staffToken) : null;
  const isAuthenticated = Boolean(payload?.id) || ["admin", "manager", "picker"].includes(String(staff?.role ?? ""));
  // a wholesale customer sees what he may order: the shop minus its 12 + the warehouse (Product.wholesaleStock)
  const viewer = payload?.id
    ? await prisma.customer.findUnique({ where: { id: Number(payload.id) }, select: { priceType: true, loyaltyCard: true, maxmaDiscount: true } })
    : null;
  const priceType = viewer?.priceType ?? null;
  const wholesale = isWholesaleType(priceType);
  // whose prices the range and the price sort go by (staff — wholesale, as before)
  const shownType: PriceType = viewer ? resolveCustomerPriceType(pricingCustomer(viewer, request)) : isAuthenticated ? "wholesale" : "guest";

  // ?page=abc / 0 / -5 → page 1 (it was a 500 from the database)
  const pageRaw = Math.floor(Number(searchParams.get("page") || 1));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 1000) : 1;
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
    // скрытые в админ-панели товары покупатели не видят (корзина — ?ids= ниже — их ещё показывает)
    hidden: false,
    ...(categoryGuids.length > 0 ? { categoryGuid: { in: categoryGuids } } : {}),
    ...(brandGuids.length > 0 ? { brandGuid: { in: brandGuids } } : {}),
    ...(onlyStock ? (wholesale ? { wholesaleStock: { gt: 0 } } : { stock: { gt: 0 } }) : {}),
    ...(quick.includes("new") ? { createdAt: { gte: newSince } } : {}),
    // «Со скидкой»: a flag kept by import-prices.js (was an IN-list of thousands of guids — audit PERF-02)
    ...(quick.includes("sale") ? { hasDiscount: true } : {}),
    ...(quick.includes("gift")
      ? { name: { contains: "Подарок", mode: "insensitive" } }
      : {}),
    // search by words (each word in the name / brand / article / barcode, any order) + product type
    ...(nameAny.length > 0 || search
      ? {
          AND: [
            ...(nameAny.length > 0 ? [{ OR: nameAny.map((s) => ({ name: { contains: s, mode: "insensitive" } })) }] : []),
            ...(search ? [productSearchWhere(search)] : []),
          ],
        }
      : {}),
  };

  const include = {
    category: true,
    brand: true,
    images: { take: 1, orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
    prices: true,
  };
  // ?lite=1 (mobile apps): no description — it is ~65% of the page and cards don't show it
  const omit = searchParams.get("lite") === "1" ? { description: true } : undefined;

  const applyPrices = (product: any) => {
    const flat = withFlatPrices(product);
    if (!isAuthenticated) return maskGuestPrices(flat);
    return wholesale ? { ...flat, stock: customerStock(flat.stock, priceType, product.wholesaleStock) } : flat;
  };

  /** price range / «sale» → the guids that pass (null — no such filter) */
  async function priceFilterGuids(): Promise<string[] | null> {
    if (priceMin === null && priceMax === null) return null;
    const prices = await priceIndex();
    // by the prices this viewer sees — a guest never by wholesale ones (he could narrow the range down
    // and work out the hidden wholesale price of any product)
    const priceList = shownPrices(prices, shownType);
    const merged: string[] = [];
    for (const [guid, price] of priceList) {
      if (priceMin !== null && price < priceMin) continue;
      if (priceMax !== null && price > priceMax) continue;
      merged.push(guid);
    }
    return merged;
  }

  // ?facets=brand: the brands of the products these filters / this search find (the brand filter
  // itself ignored, so the list doesn't shrink to the chosen ones), most products first
  if (searchParams.get("facets") === "brand") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { brandGuid: _chosen, ...fw } = where;
    const guids = await priceFilterGuids();
    if (guids) fw.guid = { in: guids };
    const rows = await prisma.product.groupBy({ by: ["brandGuid"], where: { ...fw, brandGuid: { not: null } }, _count: { _all: true } });
    const names = new Map(
      (await prisma.brand.findMany({ where: { guid: { in: rows.map((x) => x.brandGuid as string) } }, select: { guid: true, name: true } })).map((b) => [b.guid, b.name])
    );
    const brands = rows
      .filter((x) => x.brandGuid && names.get(x.brandGuid)?.trim())
      .map((x) => ({ guid: x.brandGuid as string, name: names.get(x.brandGuid as string)!.trim(), count: x._count._all }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
    return NextResponse.json({ brands });
  }

  // ?related=ID&kind=together|similar: the strip under a product («С этим берут» / «Похожие», lib/related.ts)
  const relatedParam = Number(searchParams.get("related"));
  if (Number.isInteger(relatedParam) && relatedParam > 0) {
    const kind = searchParams.get("kind") === "similar" ? "similar" : "together";
    const ids = await relatedIds(relatedParam, kind, wholesale);
    const found = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, include, omit }) : [];
    const order = new Map(ids.map((id, i) => [id, i]));
    found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return NextResponse.json({ products: found.map(applyPrices), total: found.length, page: 1, hasMore: false });
  }

  // ?ids=1,2,3 (the cart, up to 120): these products as they are now, in one request instead of one
  // request per cart line. Products no longer in the catalogue are simply missing from the answer.
  const idsParam = searchParams.get("ids");
  if (idsParam !== null) {
    const ids = [...new Set(idsParam.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 120);
    const found = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, include, omit }) : [];
    return NextResponse.json({ products: found.map(applyPrices), total: found.length, page: 1, hasMore: false });
  }

  // Prices live in a separate ProductPrice relation, so they can only be
  // filtered/sorted by loading them into memory — that's expensive on a
  // big catalog. Only pay that cost when the request actually needs it
  // (a price filter, price sort, or the "sale" quick filter); everything
  // else uses a plain, cheap, DB-paginated query.
  const needsPriceJoin =
    priceMin !== null ||
    priceMax !== null ||
    sort === "price_asc" ||
    sort === "price_desc";

  // sort name / newest / popularity (most sold, then recently updated); in stock always first
  const dbOrder =
    sort === "name"
      ? [{ name: "asc" as const }]
      : quick.includes("new")
      ? [{ createdAt: "desc" as const }]
      : [{ salesCount: "desc" as const }, { updatedAt: "desc" as const }];

  if (!needsPriceJoin) {
    const { products, total } = await pageInStockFirst(where, dbOrder, page, limit, include, omit, wholesale);

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
  const priceList = shownPrices(prices, shownType);
  const priceGuids = await priceFilterGuids();
  if (priceGuids) where.guid = { in: priceGuids };

  // ── Step 4a: no price sort → fully DB-paginated ──────────────────────────
  const needsPriceSort = sort === "price_asc" || sort === "price_desc";

  if (!needsPriceSort) {
    const { products, total } = await pageInStockFirst(where, dbOrder, page, limit, include, omit, wholesale);

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
  const MAX_SORT_CANDIDATES = 50_000; // the whole catalog (~12k) — a lower cap cut products off and showed «10 000 товаров»

  // The sorted id list for these filters is cached for a minute: scrolling pages 2, 3, … and
  // other customers with the same filters reuse it instead of loading ~12k rows each time
  // (under load the price sort used to take seconds).
  const sortKey = createHash("sha1").update(JSON.stringify([where, sort, prices.at, shownType, wholesale])).digest("hex");
  let sortedIds = sortedMemo.get(sortKey);
  if (!sortedIds || Date.now() - sortedIds.at > 60_000) {
    const matched = await prisma.product.findMany({
      where,
      select: { id: true, guid: true, stock: true, wholesaleStock: true },
      take: MAX_SORT_CANDIDATES,
    });
    const priceByGuid = priceList;
    // out of stock at the very end; products without a price (none or 0 ₽) after the priced ones
    matched.sort((a, b) => {
      const inStock = (p: { stock: number | null; wholesaleStock: number }) => (wholesale ? p.wholesaleStock > 0 : (p.stock ?? 0) > 0);
      const sa = inStock(a) ? 1 : 0;
      const sb = inStock(b) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      const pa = priceByGuid.get(a.guid) ?? 0;
      const pb = priceByGuid.get(b.guid) ?? 0;
      if (!(pa > 0) || !(pb > 0)) return (pb > 0 ? 1 : 0) - (pa > 0 ? 1 : 0);
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
    sortedIds = { at: Date.now(), ids: matched.map((p) => p.id) };
    sortedMemo.delete(sortKey);
    sortedMemo.set(sortKey, sortedIds);
    while (sortedMemo.size > 100) sortedMemo.delete(sortedMemo.keys().next().value as string);
  }

  if (sortedIds.ids.length === 0) {
    return NextResponse.json({ nameAnyApplied: nameAny.length > 0, products: [], total: 0, page, hasMore: false });
  }

  const total = sortedIds.ids.length;
  const pageIds = sortedIds.ids.slice((page - 1) * limit, page * limit);

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
