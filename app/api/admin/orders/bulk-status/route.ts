import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_TRANSITIONS } from "@/lib/orderStatus";

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { orderIds, toStatus } = await request.json();

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "Не выбраны заказы" }, { status: 400 });
  }
  if (!toStatus || typeof toStatus !== "string") {
    return NextResponse.json({ error: "Не указан статус" }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, status: true },
  });

  const updated: number[] = [];
  const skipped: number[] = [];

  // Separate eligible orders from those whose status transition is not allowed
  for (const order of orders) {
    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(toStatus)) {
      skipped.push(order.id);
    } else {
      updated.push(order.id);
    }
  }

  if (updated.length > 0) {
    // Single transaction: one updateMany + one createMany — O(1) round trips instead of O(n)
    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: { in: updated } },
        data: { status: toStatus },
      }),
      prisma.orderStatusLog.createMany({
        data: updated.map((orderId) => ({
          orderId,
          fromStatus: orders.find((o) => o.id === orderId)!.status,
          toStatus,
          userId: user.id as number,
        })),
      }),
    ]);
  }

  return NextResponse.json({ updated, skipped });
}
