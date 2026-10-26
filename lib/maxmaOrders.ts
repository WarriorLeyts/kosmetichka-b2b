import { prisma } from "@/lib/prisma";
import {
  calcLoyalty,
  cancelOrder,
  confirmOrder,
  maxmaConfigured,
  setLoyaltyOrder,
  type LoyaltyResult,
  type PromoLine,
} from "@/lib/maxma";
import { PROMO_NOT_FOR_ITEMS } from "@/lib/promo";

/**
 * Orders registered in MAXMA as «site-<id>» (v2/set-order): with a promo code, spent bonuses
 * or an expected accrual.
 */
export const MAXMA_ORDER_WHERE = {
  OR: [{ promoCode: { not: null } }, { bonusesApplied: { gt: 0 } }, { bonusesCollected: { gt: 0 } }],
};

/** The order is registered in MAXMA (same rule as MAXMA_ORDER_WHERE). */
export function isMaxmaOrder(o: { promoCode?: string | null; bonusesApplied?: number | null; bonusesCollected?: number | null }) {
  return Boolean(o.promoCode) || (o.bonusesApplied ?? 0) > 0 || (o.bonusesCollected ?? 0) > 0;
}

/** Order status in which MAXMA confirms the order: accrues bonuses, writes off spent ones (customer sees «Выполнен»). */
export const MAXMA_CONFIRM_STATUS = "exported";
/** Order status in which MAXMA cancels the order (reserved bonuses return, no accrual). */
export const MAXMA_CANCEL_STATUS = "cancelled";

/**
 * Keeps the MAXMA order (registered with v2/set-order as «site-<id>») in step with the
 * site order: exported → confirm-order, cancelled → cancel-order. Only orders registered
 * in MAXMA (MAXMA_ORDER_WHERE). Best effort: never throws, errors are logged — call it without await.
 */
export async function onOrderStatus(orderIds: number | number[], newStatus: string): Promise<void> {
  try {
    if (newStatus !== MAXMA_CONFIRM_STATUS && newStatus !== MAXMA_CANCEL_STATUS) return;
    const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0 || !maxmaConfigured()) return;

    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, ...MAXMA_ORDER_WHERE },
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

export type BonusRecalcResult = {
  /** applied — MAXMA recalculated; unchanged-error — MAXMA unavailable: previous values kept (capped by line sums) */
  status: "applied" | "unchanged-error";
  /** Bonuses spent (₽ discount) after the recalculation */
  applied: number;
  /** Bonuses spent before the recalculation (the requested amount) */
  previous: number;
  /** Expected accrual after the recalculation */
  collected: number;
};

export type LoyaltyRecalcResult = {
  /** null when the order has no promo code */
  promo: PromoRecalcResult | null;
  /** null when the order has neither spent nor expected bonuses */
  bonuses: BonusRecalcResult | null;
};

/** «Промокод CODE больше не подходит: <reason>. Скидка снята.» for status "removed", otherwise undefined. */
export function promoWarning(r: PromoRecalcResult | null | undefined): string | undefined {
  if (!r || r.status !== "removed") return undefined;
  return `Промокод ${r.code} больше не подходит: ${r.reason || "не применён"}. Скидка снята.`;
}

/** «Списание бонусов уменьшено до N, потому что изменился состав заказа.» when fewer bonuses are spent now. */
export function loyaltyWarning(r: LoyaltyRecalcResult | null | undefined): string | undefined {
  const b = r?.bonuses;
  if (!b || b.applied >= b.previous) return undefined;
  return `Списание бонусов уменьшено до ${b.applied}, потому что изменился состав заказа.`;
}

/** Response fields of item edits: promo, promoWarning, loyalty, loyaltyWarning (only those that apply). */
export function loyaltyResponse(r: LoyaltyRecalcResult | null) {
  const pw = promoWarning(r?.promo);
  const lw = loyaltyWarning(r);
  return {
    promo: r?.promo ?? null,
    ...(pw ? { promoWarning: pw } : {}),
    ...(r?.bonuses ? { loyalty: r.bonuses } : {}),
    ...(lw ? { loyaltyWarning: lw } : {}),
  };
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

type RecalcItem = { id: number; total: number; discount: number; bonusDiscount: number };

/**
 * Recalculates promo code and bonuses of an order after its items changed. Orders not
 * registered in MAXMA (no promo code, no spent / expected bonuses): returns null, touches nothing.
 *
 * MAXMA (v2/calculate-purchase) gets the current lines built like at order creation
 * (sku = product guid or id, title = line name, unit price, qty), the promo code and the
 * originally spent bonuses as the requested amount (MAXMA caps it by its new maxToApply).
 * Then in one transaction OrderItem.discount / bonusDiscount, Order.discount, bonusesApplied,
 * bonusesCollected and total (= Σ line totals − discount − bonusesApplied) are updated.
 * The promo code no longer applies → its discount 0 and Order.promoCode = null. Something still
 * registered (promo, bonuses or accrual) → v2/set-order «site-<id>» again, otherwise
 * cancel-order (both best effort). MAXMA unavailable / not configured → previous discounts
 * kept, only capped by the line sums (warning logged). Never throws.
 */
export async function recalcOrderLoyalty(orderId: number): Promise<LoyaltyRecalcResult | null> {
  let code = "";
  let previous = 0;
  let loaded = false;
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        promoCode: true,
        bonusesApplied: true,
        bonusesCollected: true,
        customer: { select: { phone: true, loyaltyCard: true, priceType: true } },
        items: {
          orderBy: { id: "asc" },
          select: { id: true, productId: true, productName: true, price: true, quantity: true, total: true, discount: true, bonusDiscount: true },
        },
      },
    });
    if (!order) return null;
    loaded = true;
    code = order.promoCode ?? "";
    previous = order.bonusesApplied ?? 0;
    const prevCollected = order.bonusesCollected ?? 0;
    if (!code && previous <= 0 && prevCollected <= 0) return null;
    const items = order.items;
    const customer = order.customer ?? {};

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

    let calc: LoyaltyResult | null = null;
    if (lines.length > 0) {
      if (!maxmaConfigured()) return await keepCapped(orderId, code, items, prevCollected, previous, "not_configured");
      try {
        calc = await calcLoyalty({
          customer,
          lines,
          promocode: code || null,
          applyBonuses: previous,
          // spending was allowed when the order was placed: keep the requested amount
          spendAllowed: previous > 0 && Boolean(customer.loyaltyCard?.trim()),
        });
      } catch (e) {
        return await keepCapped(orderId, code, items, prevCollected, previous, e instanceof Error ? e.message : String(e));
      }
    }

    let reason: string | undefined;
    if (code) {
      if (!calc) reason = "в заказе не осталось товаров";
      else if (!calc.promo?.applied) reason = calc.promo?.error || "не применён";
      else if (calc.promo.discount <= 0) reason = PROMO_NOT_FOR_ITEMS;
    }
    const promoApplied = Boolean(code) && !reason;
    const zeros = items.map(() => 0);
    const promoLines = promoApplied && calc?.promo ? calc.promo.lines : zeros;
    const bonusLines = calc ? calc.bonusLines : zeros;
    const discount = sum(promoLines);
    const applied = sum(bonusLines);
    const collected = calc?.bonuses?.collected ?? 0;
    const total = sum(items.map((i) => i.total)) - discount - applied;

    await prisma.$transaction([
      ...items
        .map((i, idx) => ({ i, d: promoLines[idx], b: bonusLines[idx] }))
        .filter(({ i, d, b }) => i.discount !== d || (i.bonusDiscount ?? 0) !== b)
        .map(({ i, d, b }) => prisma.orderItem.update({ where: { id: i.id }, data: { discount: d, bonusDiscount: b } })),
      prisma.order.update({
        where: { id: orderId },
        data: {
          discount,
          bonusesApplied: applied,
          bonusesCollected: collected,
          total,
          ...(code && !promoApplied ? { promoCode: null } : {}),
        },
      }),
    ]);

    const promo: PromoRecalcResult | null = !code
      ? null
      : promoApplied
        ? { status: "applied", code, discount }
        : { status: "removed", code, discount: 0, reason };
    const bonuses: BonusRecalcResult | null =
      previous > 0 || prevCollected > 0 || applied > 0 || collected > 0
        ? { status: "applied", applied, previous, collected }
        : null;
    if (code && !promoApplied) console.log(`[maxma] order site-${orderId}: promo ${code} removed (${reason})`);
    if (applied < previous) console.warn(`[maxma] order site-${orderId}: bonuses reduced ${previous} → ${applied}`);

    if (promoApplied || applied > 0 || collected > 0) {
      try {
        const r = await setLoyaltyOrder(orderId, lines, { customer, promocode: promoApplied ? code : null, applyBonuses: applied });
        if (applied > 0 && r.applied !== applied) {
          console.error(`[maxma] BONUSES MISMATCH site-${orderId} (recalc): order spends ${applied}, MAXMA reserved ${r.applied}`);
        }
        console.log(`[maxma] order site-${orderId}: recalculated, promo ${promoApplied ? discount : 0}, bonuses −${applied} +${collected}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : e;
        if (applied > 0) console.error(`[maxma] BONUSES NOT RESERVED: set-order site-${orderId} (recalc) failed, bonuses ${applied}:`, msg);
        else console.error(`[maxma] set-order site-${orderId} (recalc) failed:`, msg);
      }
    } else if (maxmaConfigured()) {
      try {
        await cancelOrder(orderId);
      } catch (e) {
        console.error(`[maxma] cancel-order site-${orderId} (nothing left) failed:`, e instanceof Error ? e.message : e);
      }
    }
    return { promo, bonuses };
  } catch (e) {
    console.error(`[maxma] recalcOrderLoyalty site-${orderId}:`, e);
    return {
      promo: code || !loaded ? { status: "unchanged-error", code, discount: 0, reason: "ошибка пересчёта промокода" } : null,
      bonuses: previous > 0 ? { status: "unchanged-error", applied: previous, previous, collected: 0 } : null,
    };
  }
}

/**
 * Fallback when MAXMA can't be asked: each line keeps its promo discount capped by the new
 * line total and its bonus discount capped by what is left (new lines have 0); accrual kept.
 */
async function keepCapped(
  orderId: number,
  code: string,
  items: RecalcItem[],
  collected: number,
  previous: number,
  why: string
): Promise<LoyaltyRecalcResult> {
  console.warn(`[maxma] order site-${orderId}: loyalty not recalculated (${why}), keeping capped discounts`);
  const promoLines = items.map((i) => Math.min(Math.max(0, i.discount), Math.max(0, i.total)));
  const bonusLines = items.map((i, idx) => Math.min(Math.max(0, i.bonusDiscount ?? 0), Math.max(0, i.total - promoLines[idx])));
  const discount = sum(promoLines);
  const applied = sum(bonusLines);
  const total = sum(items.map((i) => i.total)) - discount - applied;
  if (applied < previous) {
    console.error(`[maxma] BONUSES MISMATCH site-${orderId}: order spends ${applied} now, MAXMA still reserves ${previous}`);
  }
  await prisma.$transaction([
    ...items
      .map((i, idx) => ({ i, d: promoLines[idx], b: bonusLines[idx] }))
      .filter(({ i, d, b }) => i.discount !== d || (i.bonusDiscount ?? 0) !== b)
      .map(({ i, d, b }) => prisma.orderItem.update({ where: { id: i.id }, data: { discount: d, bonusDiscount: b } })),
    prisma.order.update({ where: { id: orderId }, data: { discount, bonusesApplied: applied, total } }),
  ]);
  return {
    promo: code ? { status: "unchanged-error", code, discount, reason: "сервис лояльности недоступен" } : null,
    bonuses: previous > 0 || collected > 0 ? { status: "unchanged-error", applied, previous, collected } : null,
  };
}
