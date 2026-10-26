import { prisma } from "@/lib/prisma";
import {
  calcPromo,
  cancelOrder,
  confirmOrder,
  maxmaConfigured,
  setOrder,
  type PromoLine,
  type PromoResult,
} from "@/lib/maxma";
import { orderSums } from "@/lib/orderPricing";
import { PROMO_NOT_FOR_ITEMS } from "@/lib/promo";

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

export type PromoRecalcResult = {
  /**
   * applied — MAXMA recalculated the code for the current items;
   * removed — the code no longer applies: discount set to 0 and Order.promoCode cleared;
   * unchanged-error — MAXMA unavailable / not configured: existing line discounts kept (capped by line totals).
   */
  status: "applied" | "removed" | "unchanged-error";
  /** The order's promo code (as it was before the recalculation) */
  code: string;
  /** Order discount after the recalculation, whole roubles */
  discount: number;
  reason?: string;
};

/** «Промокод CODE больше не подходит: <reason>. Скидка снята.» for status "removed", otherwise undefined. */
export function promoWarning(r: PromoRecalcResult | null | undefined): string | undefined {
  if (!r || r.status !== "removed") return undefined;
  return `Промокод ${r.code} больше не подходит: ${r.reason || "не применён"}. Скидка снята.`;
}

/**
 * Recalculates the promo discount of an order after its items changed. Orders without a
 * promo code: returns null and touches nothing.
 *
 * MAXMA (v2/calculate-purchase) gets the current lines built like at order creation
 * (sku = product guid or id, title = line name, unit price, qty); then in one transaction
 * every OrderItem.discount, Order.discount and Order.total (= Σ line totals − discount)
 * are updated. The code no longer applies → discount 0, Order.promoCode = null, MAXMA
 * cancel-order (best effort); applies → v2/set-order «site-<id>» again (best effort).
 * MAXMA unavailable / not configured → line discounts are only capped by the line totals
 * (warning logged). Never throws.
 */
export async function recalcOrderPromo(orderId: number): Promise<PromoRecalcResult | null> {
  let code = "";
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        promoCode: true,
        customer: { select: { phone: true } },
        items: { orderBy: { id: "asc" }, select: { id: true, productId: true, productName: true, price: true, quantity: true, total: true, discount: true } },
      },
    });
    if (!order?.promoCode) return null;
    code = order.promoCode;
    const items = order.items;
    const phone = order.customer?.phone ?? null;

    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
      select: { id: true, guid: true },
    });
    const guidById = new Map(products.map((p) => [p.id, p.guid]));
    const lines: PromoLine[] = items.map((i) => ({
      sku: guidById.get(i.productId) || String(i.productId),
      productName: i.productName,
      price: i.price,
      quantity: i.quantity,
      total: i.total,
    }));

    let promo: PromoResult | null = null;
    let reason: string | undefined;
    if (lines.length === 0) {
      reason = "в заказе не осталось товаров";
    } else if (maxmaConfigured()) {
      try {
        promo = await calcPromo(lines, code, phone);
        if (!promo.applied) reason = promo.error || "не применён";
        else if (promo.discount <= 0) reason = PROMO_NOT_FOR_ITEMS;
      } catch (e) {
        return await keepCappedDiscounts(orderId, code, items, e instanceof Error ? e.message : String(e));
      }
    } else {
      return await keepCappedDiscounts(orderId, code, items, "not_configured");
    }

    const applied = !reason && promo !== null;
    const lineDiscounts = applied ? promo!.lines : items.map(() => 0);
    const discount = lineDiscounts.reduce((s, d) => s + d, 0);
    const total = items.reduce((s, i) => s + i.total, 0) - discount;

    await prisma.$transaction([
      ...items
        .map((i, idx) => ({ i, d: lineDiscounts[idx] }))
        .filter(({ i, d }) => i.discount !== d)
        .map(({ i, d }) => prisma.orderItem.update({ where: { id: i.id }, data: { discount: d } })),
      prisma.order.update({
        where: { id: orderId },
        data: { discount, total, ...(applied ? {} : { promoCode: null }) },
      }),
    ]);

    if (applied) {
      try {
        await setOrder(orderId, lines, code, phone);
        console.log(`[maxma] order site-${orderId}: promo ${code} recalculated, discount ${discount}`);
      } catch (e) {
        console.error(`[maxma] set-order site-${orderId} (recalc) failed:`, e instanceof Error ? e.message : e);
      }
      return { status: "applied", code, discount };
    }

    console.log(`[maxma] order site-${orderId}: promo ${code} removed (${reason})`);
    if (maxmaConfigured()) {
      try {
        await cancelOrder(orderId);
      } catch (e) {
        console.error(`[maxma] cancel-order site-${orderId} (promo removed) failed:`, e instanceof Error ? e.message : e);
      }
    }
    return { status: "removed", code, discount: 0, reason };
  } catch (e) {
    console.error(`[maxma] recalcOrderPromo site-${orderId}:`, e);
    return { status: "unchanged-error", code, discount: 0, reason: "ошибка пересчёта промокода" };
  }
}

/**
 * Fallback when MAXMA can't be asked: each line keeps its discount, capped by the new line
 * total (new lines have 0); Order.discount / total follow from the lines.
 */
async function keepCappedDiscounts(
  orderId: number,
  code: string,
  items: { id: number; total: number; discount: number }[],
  why: string
): Promise<PromoRecalcResult> {
  console.warn(`[maxma] order site-${orderId}: promo ${code} not recalculated (${why}), keeping capped discounts`);
  const capped = items.map((i) => Math.min(Math.max(0, i.discount), Math.max(0, i.total)));
  const sums = orderSums(items.map((i, idx) => ({ total: i.total, discount: capped[idx] })));
  await prisma.$transaction([
    ...items
      .map((i, idx) => ({ i, d: capped[idx] }))
      .filter(({ i, d }) => i.discount !== d)
      .map(({ i, d }) => prisma.orderItem.update({ where: { id: i.id }, data: { discount: d } })),
    prisma.order.update({ where: { id: orderId }, data: { discount: sums.discount, total: sums.total } }),
  ]);
  return { status: "unchanged-error", code, discount: sums.discount, reason: "сервис лояльности недоступен" };
}
