import { prisma } from "@/lib/prisma";
import { cancelOrder, confirmOrder, maxmaConfigured } from "@/lib/maxma";

/** Order status in which MAXMA confirms the promo order (customer sees «Выполнен»). */
export const MAXMA_CONFIRM_STATUS = "exported";
/** Order status in which MAXMA cancels the promo order. */
export const MAXMA_CANCEL_STATUS = "cancelled";

/**
 * Keeps the MAXMA order (registered with v2/set-order as «site-<id>») in step with the
 * site order: exported → confirm-order, cancelled → cancel-order. Only orders with a
 * promo code. Best effort: never throws, errors are logged — call it without await.
 */
export async function onOrderStatus(orderIds: number | number[], newStatus: string): Promise<void> {
  try {
    if (newStatus !== MAXMA_CONFIRM_STATUS && newStatus !== MAXMA_CANCEL_STATUS) return;
    const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0 || !maxmaConfigured()) return;

    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, promoCode: { not: null } },
      select: { id: true },
    });
    for (const { id } of orders) {
      try {
        if (newStatus === MAXMA_CANCEL_STATUS) await cancelOrder(id);
        else await confirmOrder(id);
        console.log(`[maxma] order site-${id}: ${newStatus === MAXMA_CANCEL_STATUS ? "cancel" : "confirm"}-order ok`);
      } catch (e) {
        console.error(`[maxma] order site-${id}: ${newStatus} sync failed:`, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[maxma] onOrderStatus:", e);
  }
}
