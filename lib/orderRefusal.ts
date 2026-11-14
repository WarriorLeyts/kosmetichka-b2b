import { prisma } from "./prisma";
import { isMaxmaOrder } from "./maxmaOrders";
import { runOrderMaxmaTasks } from "./maxmaQueue";
import { withOrderLock } from "./orderLock";
import { maxmaPhone } from "./maxma";

type LoyaltyOrder = { id: number; status: string; promoCode?: string | null; bonusesApplied?: number | null; bonusesCollected?: number | null };
export async function bonusCancellation(order: LoyaltyOrder) {
  if (order.status !== "cancelled" || !isMaxmaOrder(order)) return null;
  const task = await prisma.maxmaTask.findFirst({ where: { orderId: order.id, action: "cancel" }, orderBy: { id: "desc" }, select: { status: true, lastError: true } });
  return { status: task?.status ?? "missing", returned: order.bonusesApplied ?? 0, withdrawn: order.bonusesCollected ?? 0 };
}

export class RefusalError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Cancel the order and durably schedule MAXMA's reversal in the same transaction. */
export async function refuseOrder(orderId: number, userId: number) {
  return withOrderLock(orderId, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new RefusalError("Заказ не найден", 404);
      if (!["pending", "approved", "assembly", "consultation", "payment", "exported", "cancelled"].includes(order.status)) {
        throw new RefusalError("Этот заказ нельзя отменить", 400);
      }
      const changed = order.status !== "cancelled";
      let updated = order;
      if (changed) {
        updated = await tx.order.update({ where: { id: orderId }, data: { status: "cancelled", confirmRequestedAt: null, oneCNextTryAt: null } });
        await tx.orderStatusLog.create({ data: { orderId, fromStatus: order.status, toStatus: "cancelled", userId } });
      }
      if (isMaxmaOrder(order)) {
        // A repeated click on a cancelled order must never add a second cancellation.
        const previous = changed ? null : await tx.maxmaTask.findFirst({ where: { orderId, action: "cancel" }, orderBy: { id: "desc" } });
        if (!previous) {
          const original = await tx.maxmaTask.findFirst({ where: { orderId, action: "set" }, orderBy: { id: "desc" }, select: { payload: true } });
          let client = (original?.payload as { client?: { card: string } | { phoneNumber: string } } | null)?.client;
          if (!client) {
            const customer = await tx.customer.findUnique({ where: { id: order.customerId }, select: { loyaltyCard: true, phone: true } });
            const phone = maxmaPhone(customer?.phone ?? "");
            if (customer?.loyaltyCard?.trim()) client = { card: customer.loyaltyCard.trim() };
            else if (phone) client = { phoneNumber: phone };
          }
          await tx.maxmaTask.create({ data: { orderId, action: "cancel", ...(client ? { payload: { client } } : {}) } });
        }
        else if (previous.status === "failed") await tx.maxmaTask.updateMany({ where: { id: previous.id, status: "failed" }, data: { status: "pending", nextAt: new Date(), lastError: null } });
      }
      return { changed, order: updated };
    });
    // Failures stay in the outbox. Report pending/failed until MAXMA acknowledges the reversal.
    if (isMaxmaOrder(result.order)) await runOrderMaxmaTasks(orderId);
    return { ...result, bonusCancellation: await bonusCancellation(result.order) };
  });
}
