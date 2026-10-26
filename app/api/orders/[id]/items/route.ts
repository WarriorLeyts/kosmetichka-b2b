import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { prisma } from "@/lib/prisma";
import { orderSums } from "@/lib/orderPricing";

// Customers can modify their own pending orders: change quantities or remove items.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const payload = await verifyCustomerToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  // Customers can only edit pending orders
  if (order.status !== "pending") {
    return NextResponse.json(
      { error: "Редактирование доступно только для заказов в статусе «Ожидание»" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const {
    items = [],       // [{ id, quantity }]
    removeIds = [],   // [id, ...]
  } = body as {
    items?: { id: number; quantity: number }[];
    removeIds?: number[];
  };

  // Validate all IDs belong to this order
  const orderItemIds = new Set(order.items.map((i) => i.id));

  for (const item of items) {
    if (!orderItemIds.has(item.id)) {
      return NextResponse.json({ error: `Позиция ${item.id} не принадлежит этому заказу` }, { status: 400 });
    }
    if (item.quantity < 1) {
      return NextResponse.json({ error: "Количество должно быть не менее 1" }, { status: 400 });
    }
  }

  for (const rid of removeIds) {
    if (!orderItemIds.has(rid)) {
      return NextResponse.json({ error: `Позиция ${rid} не принадлежит этому заказу` }, { status: 400 });
    }
  }

  // Must keep at least one item
  const remainingCount = order.items.filter((i) => !removeIds.includes(i.id)).length;
  if (remainingCount === 0) {
    return NextResponse.json({ error: "В заказе должна остаться хотя бы одна позиция" }, { status: 400 });
  }

  // Apply updates in a transaction
  await prisma.$transaction(async (tx) => {
    // Update quantities (prices stay as-is — only manager can change prices)
    for (const upd of items) {
      if (removeIds.includes(upd.id)) continue;
      const existing = order.items.find((i) => i.id === upd.id)!;
      const newTotal = Math.round(existing.price * upd.quantity);
      await tx.orderItem.update({
        where: { id: upd.id },
        data: {
          quantity: upd.quantity,
          total: newTotal,
          // promo discount of the line can't exceed the new line total
          ...(existing.discount > newTotal ? { discount: newTotal } : {}),
        },
      });
    }

    // Remove items
    if (removeIds.length > 0) {
      await tx.orderItem.deleteMany({
        where: { id: { in: removeIds }, orderId },
      });
    }

    // Recalculate order total
    const remaining = await tx.orderItem.findMany({ where: { orderId } });
    // total = Σ(line total − line promo discount); without a promo code that's Σ line totals
    const sums = orderSums(remaining);
    await tx.order.update({
      where: { id: orderId },
      data: { total: sums.total, ...(order.promoCode ? { discount: sums.discount } : {}) },
    });
  });

  // Return updated order
  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          productName: true,
          barcode: true,
          quantity: true,
          price: true,
          total: true,
          discount: true,
          variantImageUrl: true,
          variantName: true,
        },
      },
    },
  });

  return NextResponse.json({ order: updatedOrder });
}
