import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getCustomerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  return payload.id as number;
}

// GET — список productId в листе ожидания
export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) return NextResponse.json({ productIds: [] });

  const items = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });

  return NextResponse.json({ productIds: items.map((i) => i.productId) });
}

// POST — добавить товар
export async function POST(request: NextRequest) {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await request.json();
  const productId = Number(body.productId);
  if (!productId) {
    return NextResponse.json({ error: "Нет productId" }, { status: 400 });
  }

  await prisma.wishlistItem.upsert({
    where: { customerId_productId: { customerId, productId } },
    update: {},
    create: { customerId, productId },
  });

  return NextResponse.json({ success: true });
}

// DELETE — убрать товар (?productId=X)
export async function DELETE(request: NextRequest) {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const productId = Number(searchParams.get("productId"));
  if (!productId) {
    return NextResponse.json({ error: "Нет productId" }, { status: 400 });
  }

  await prisma.wishlistItem.deleteMany({
    where: { customerId, productId },
  });

  return NextResponse.json({ success: true });
}
