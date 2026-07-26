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
      sort === "name" || quick.includes("new")
        ? sort === "name"
          ? { name: "asc" as const }
          : { createdAt: "desc" as const }
        : { name: "asc" as const };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include,
        orderBy,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      products: products.map(applyPrices),
      total,
      page,
      hasMore: page * limit < total,
    });
  }

  // Two-phase path: grab the lightweight matching set, look up
  // wholesale/discount prices for just those products, then filter/sort/
  // paginate in memory. Fine for a catalog of a few thousand SKUs; would
  // need a denormalized price column (or raw SQL) if it grows much larger.
  const matched = await prisma.product.findMany({
    where,
    select: { id: true, guid: true, name: true, createdAt: true },
  });

  if (matched.length === 0) {
    return NextResponse.json({ products: [], total: 0, page, hasMore: false });
  }

  const guids = matched.map((p) => p.guid);

  const prices = await prisma.productPrice.findMany({
    where: {
      productGuid: { in: guids },
      priceType: { in: ["wholesale", "discount"] },
    },
  });

  const priceByGuid = new Map<
    string,
    { wholesale?: number; hasDiscount: boolean }
  >();

  for (const price of prices) {
    const entry = priceByGuid.get(price.productGuid) || {
      hasDiscount: false,
    };

    if (price.priceType === "wholesale") entry.wholesale = price.price;
    if (price.priceType === "discount") entry.hasDiscount = true;

    priceByGuid.set(price.productGuid, entry);
  }

  const filtered = matched.filter((product) => {
    const info = priceByGuid.get(product.guid);

    if (quick.includes("sale") && !info?.hasDiscount) return false;

    if (priceMin !== null || priceMax !== null) {
      const price = info?.wholesale;

      if (price === undefined) return false;
      if (priceMin !== null && price < priceMin) return false;
      if (priceMax !== null && price > priceMax) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "price_asc" || sort === "price_desc") {
      const priceA = priceByGuid.get(a.guid)?.wholesale ?? Infinity;
      const priceB = priceByGuid.get(b.guid)?.wholesale ?? Infinity;

      return sort === "price_asc" ? priceA - priceB : priceB - priceA;
    }

    if (sort === "popularity" && quick.includes("new")) {
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return a.name.localeCompare(b.name, "ru");
  });

  const total = filtered.length;
  const start = (page - 1) * limit;
  const pageIds = filtered.slice(start, start + limit).map((p) => p.id);

  const products = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include,
  });

  const productById = new Map(products.map((product) => [product.id, product]));
  const ordered = pageIds
    .map((id) => productById.get(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));

  return NextResponse.json({
    products: ordered.map(applyPrices),
    total,
    page,
    hasMore: page * limit < total,
  });
}
