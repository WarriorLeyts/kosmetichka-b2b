import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

// PUT /api/admin/orders/[id]/items
// Body: {
//   items: [{ id, quantity, price }],   -- update existing
//   removeIds: number[],                -- delete existing
//   newItems: [{ productId, productName, barcode, quantity, price }]  -- add new
// }
export async function PUT(request: NextRequest, { params }: Props) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  // Allow editing during consultation (or assembly)
  if (!["consultation", "assembly"].includes(order.status)) {
    return NextResponse.json(
      { error: "Редактирование доступно только во время консультации или сборки" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const updates: { id: number; quantity: number; price: number }[] = body.items ?? [];
  const removeIds: number[] = body.removeIds ?? [];
  const newItems: { productId: number; productName: string; barcode?: string | null; quantity: number; price: number }[] =
    body.newItems ?? [];

  // Validate all existing item IDs belong to this order
  const orderItemIds = new Set(order.items.map((i) => i.id));
  for (const u of updates) {
    if (!orderItemIds.has(u.id)) {
      return NextResponse.json({ error: `Позиция ${u.id} не принадлежит заказу` }, { status: 400 });
    }
  }

  // Delete removed items (and their checks/photos)
  if (removeIds.length > 0) {
    const validRemoveIds = removeIds.filter((rid) => orderItemIds.has(rid));
    await prisma.orderItemCheck.deleteMany({ where: { orderItemId: { in: validRemoveIds } } });
    await prisma.orderItemPhoto.deleteMany({ where: { orderItemId: { in: validRemoveIds } } });
    await prisma.orderItem.deleteMany({ where: { id: { in: validRemoveIds } } });
  }

  // Update remaining existing items
  for (const u of updates) {
    if (removeIds.includes(u.id)) continue;
    const qty = Math.max(1, Math.round(u.quantity));
    const price = Math.max(0, Math.round(u.price));
    await prisma.orderItem.update({
      where: { id: u.id },
      data: { quantity: qty, price, total: qty * price },
    });
  }

  // Create new items
  for (const ni of newItems) {
    const qty = Math.max(1, Math.round(ni.quantity));
    const price = Math.max(0, Math.round(ni.price));
    await prisma.orderItem.create({
      data: {
        orderId,
        productId: ni.productId,
        productName: ni.productName,
        barcode: ni.barcode ?? null,
        quantity: qty,
        price,
        total: qty * price,
      },
    });
  }

  // Recalculate order total
  const remaining = await prisma.orderItem.findMany({ where: { orderId } });
  const newTotal = remaining.reduce((s, i) => s + i.total, 0);
  await prisma.order.update({ where: { id: orderId }, data: { total: newTotal } });

  // Fetch updated order with items
  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { check: { include: { picker: { select: { name: true } } } }, photos: true } },
    },
  });

  return NextResponse.json({ order: updated });
}
