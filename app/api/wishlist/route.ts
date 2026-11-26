import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { demandId, demandQuantity, demandSameOrigin } from "@/lib/customerDemand";
import { customerStock } from "@/lib/utils";

async function getCustomerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyCustomerToken(token);
  return payload?.id ? Number(payload.id) : null;
}

/** GET /api/wishlist — returns { productIds, products } */
export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ productIds: [], products: [] });
  }

  const [items, me, missingCount] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true,
            article: true,
            stock: true,
            wholesaleStock: true,
            images: { select: { path: true }, take: 1 },
            prices: { select: { priceType: true, price: true } },
            brand: { select: { name: true } },
          },
        },
      },
    }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { priceType: true } }),
    prisma.productWish.count({ where: { customerId, closed: false, linkedProductId: null } }),
  ]);

  return NextResponse.json({
    missingCount,
    productIds: items.map((i) => i.productId),
    products: items.map((i) => ({
      ...i.product,
      stock: customerStock(i.product.stock, me?.priceType, i.product.wholesaleStock),
      notified: i.notified,
      wishlistItemId: i.id,
      quantity: i.quantity,
      notifiedAt: i.notifiedAt,
    })),
  });
}

/** POST /api/wishlist — body: { productId: number }
 *  Toggles membership. Returns { added: boolean } */
export async function POST(request: Request) {
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const productId = demandId((await request.json().catch(() => null))?.productId);
  if (!productId) {
    return NextResponse.json({ error: "productId обязателен" }, { status: 400 });
  }

  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId, productId: Number(productId) } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({
      where: { customerId_productId: { customerId, productId: Number(productId) } },
    });
    return NextResponse.json({ added: false });
  } else {
    const product = await prisma.product.findFirst({ where: { id: productId, hidden: false }, select: { id: true } });
    if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    await prisma.wishlistItem.create({
      data: { customerId, productId: Number(productId), notified: false },
    });
    return NextResponse.json({ added: true });
  }
}

/** DELETE /api/wishlist?productId=N — removes item */
export async function DELETE(request: Request) {
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = Number(url.searchParams.get("productId"));
  if (!productId) {
    return NextResponse.json({ error: "productId обязателен" }, { status: 400 });
  }

  await prisma.wishlistItem.deleteMany({
    where: { customerId, productId },
  });

  return NextResponse.json({ removed: true });
}

/** PATCH /api/wishlist — body: { productId: number, notified: boolean }
 *  Marks item as notified (shown "back in stock" badge) */
export async function PATCH(request: Request) {
  return PUT(request);
}

/** Idempotent quantity save. The legacy POST toggle remains compatible with installed apps. */
export async function PUT(request: Request) {
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) ?? {};
  const productId = demandId(body.productId), quantity = demandQuantity(body.quantity);
  if (!productId || !quantity) return NextResponse.json({ error: "Укажите товар и целое количество от 1 до 10 000" }, { status: 400 });
  const [product, customer] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, hidden: false }, select: { id: true, stock: true, wholesaleStock: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { priceType: true } }),
  ]);
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  const existing = await prisma.wishlistItem.findUnique({ where: { customerId_productId: { customerId, productId } } });
  const out = Number(customerStock(product.stock, customer?.priceType, product.wholesaleStock)) <= 0;
  if (!existing && !out) return NextResponse.json({ error: "Товар уже в наличии. Откройте карточку товара." }, { status: 409 });
  await prisma.wishlistItem.upsert({ where: { customerId_productId: { customerId, productId } }, create: { customerId, productId, quantity }, update: { quantity, ...(out ? { notified: false, notifiedAt: null } : {}) } });
  return NextResponse.json({ added: true, quantity });
}
