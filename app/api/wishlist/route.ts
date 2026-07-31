import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

async function getCustomerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.id ? Number(payload.id) : null;
}

/** GET /api/wishlist — returns { productIds, products } */
export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ productIds: [], products: [] });
  }

  const items = await prisma.wishlistItem.findMany({
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
          images: { select: { path: true }, take: 1 },
          prices: { select: { priceType: true, price: true } },
          brand: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    productIds: items.map((i) => i.productId),
    products: items.map((i) => ({
      ...i.product,
      notified: i.notified,
      wishlistItemId: i.id,
    })),
  });
}

/** POST /api/wishlist — body: { productId: number }
 *  Toggles membership. Returns { added: boolean } */
export async function POST(request: Request) {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const { productId } = await request.json();
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
    await prisma.wishlistItem.create({
      data: { customerId, productId: Number(productId), notified: false },
    });
    return NextResponse.json({ added: true });
  }
}

/** DELETE /api/wishlist?productId=N — removes item */
export async function DELETE(request: Request) {
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
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const { productId, notified } = await request.json();
  if (!productId) {
    return NextResponse.json({ error: "productId обязателен" }, { status: 400 });
  }

  await prisma.wishlistItem.updateMany({
    where: { customerId, productId: Number(productId) },
    data: { notified: Boolean(notified) },
  });

  return NextResponse.json({ ok: true });
}
