import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_TRANSITIONS } from "@/lib/orderStatus";
import { onOrderStatus } from "@/lib/maxmaOrders";
import { notifyOrderStatus } from "@/lib/notify";
import { confirmRequest, paymentBlocked } from "@/lib/orderConfirm";
import { withOrderLock } from "@/lib/orderLock";

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
    select: { id: true, status: true, confirmRequestedAt: true, customerConfirmed: true },
  });

  const updated: number[] = [];
  const skipped: number[] = [];

  for (const order of orders) {
    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    // «Заказ оформлен» waits for the customer's confirmation; «Сборка → На проверке» only one by one
    // (the assembly marks become the order there — out of stock removed, fact quantities set)
    if (!allowed.includes(toStatus) || (toStatus === "payment" && paymentBlocked(order)) || (order.status === "assembly" && toStatus === "consultation")) {
      skipped.push(order.id);
      continue;
    }
    // one change of an order at a time, and only from the status it was read in (a cancel meanwhile wins)
    const ok = await withOrderLock(order.id, async () => {
      const earlier = ["assembly", "pending", "approved"].includes(toStatus);
      const [moved] = await prisma.$transaction([
        prisma.order.updateMany({
          where: { id: order.id, status: order.status },
          data: {
            status: toStatus,
            ...(toStatus === "consultation" ? confirmRequest() : {}),
            ...(earlier ? { confirmRequestedAt: null, customerConfirmed: false } : {}),
          },
        }),
      ]);
      if (moved.count === 0) return false;
      await prisma.orderStatusLog.create({ data: { orderId: order.id, fromStatus: order.status, toStatus, userId: user.id as number } });
      // back to the manager: the assembly is checked again (as the single status change does)
      if (earlier) await prisma.orderItemCheck.deleteMany({ where: { orderItem: { orderId: order.id } } });
      return true;
    });
    (ok ? updated : skipped).push(order.id);
  }

  if (updated.length > 0) {
    // MAXMA: confirm / cancel via the queue (tasks saved now, calls in the background)
    await onOrderStatus(updated, toStatus, { background: true });
    void notifyOrderStatus(updated, toStatus);
  }

  return NextResponse.json({ updated, skipped });
}
