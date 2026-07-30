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

/** GET /api/wishlist — returns { productIds: number[] } */
export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ productIds: [] });
  }

  const items = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });

  return NextResponse.json({
    productIds: items.map((i) => i.productId),
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
      data: { customerId, productId: Number(productId) },
    });
    return NextResponse.json({ added: true });
  }
}
