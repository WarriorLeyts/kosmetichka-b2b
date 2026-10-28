import { prisma } from "@/lib/prisma";
import { orderSums } from "@/lib/orderPricing";
import { isMaxmaOrder, recalcOrderLoyalty } from "@/lib/maxmaOrders";
import { changeChatMessage, logOrderChanges, type ChangeRow } from "@/lib/orderChanges";

/**
 * The manager collected the order (the assembly screen, «Отправить проверку»): what he found becomes
 * the order itself, so the customer checks the real order —
 *   «Нет в наличии» (fact 0)           → the line is removed;
 *   «Не хватает» (fact less than plan) → quantity = what is there;
 *   «Просрочен» / «Плохой вид» with N  → N pieces less (0 left → removed).
 * Every change is logged for the customer («Изменено менеджером · было 3 шт.», «Удалено менеджером»)
 * and goes to the order chat as one card with photos.
 */

type Entry = { s: string; q: number | null };

/** "ok" | '["out_of_stock"]' | '[{"s":"expired","q":2},"bad_condition"]' | legacy single code */
export function parseCheck(status: string): Entry[] {
  if (!status || status === "ok") return [{ s: "ok", q: null }];
  try {
    const v = JSON.parse(status);
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === "string" ? { s: x, q: null } : { s: String(x?.s ?? ""), q: Number.isFinite(Number(x?.q)) ? Number(x.q) : null }));
    }
  } catch {
    /* a plain code */
  }
  return [{ s: status, q: null }];
}

/** How many pieces the customer gets after the check (0 = remove the line). */
export function pickedQuantity(quantity: number, status: string, availableQty: number | null): number {
  const entries = parseCheck(status);
  if (entries.some((e) => e.s === "out_of_stock")) return 0;
  let qty = quantity;
  const short = entries.find((e) => e.s === "insufficient_qty");
  if (short) {
    const have = availableQty ?? short.q;
    if (have != null && have >= 0) qty = Math.min(qty, Math.floor(have));
  }
  // spoiled pieces with a number are taken out; without a number the line stays (the manager decides)
  const spoiled = entries.filter((e) => (e.s === "expired" || e.s === "bad_condition") && e.q != null && e.q > 0).reduce((n, e) => n + (e.q as number), 0);
  if (spoiled > 0) qty = Math.max(0, qty - spoiled);
  return Math.max(0, qty);
}

export type ApplyResult = { changed: ChangeRow[]; emptied: boolean };

export async function applyPickChecks(orderId: number, actor: { id: number; name: string | null }): Promise<ApplyResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { check: true } } },
  });
  if (!order) return { changed: [], emptied: false };

  const plan = order.items.map((i) => ({ item: i, qty: i.check ? pickedQuantity(i.quantity, i.check.status, i.check.availableQty) : i.quantity }));
  if (plan.every((p) => p.qty === p.item.quantity)) return { changed: [], emptied: false };
  // nothing at all is left: leave the order as it is — the manager replaces the products or cancels it
  if (plan.every((p) => p.qty === 0)) return { changed: [], emptied: true };

  const removeIds = plan.filter((p) => p.qty === 0).map((p) => p.item.id);
  const updates = plan.filter((p) => p.qty > 0 && p.qty !== p.item.quantity);
  await prisma.$transaction([
    prisma.orderItemCheck.deleteMany({ where: { orderItemId: { in: removeIds } } }),
    prisma.orderItemPhoto.deleteMany({ where: { orderItemId: { in: removeIds } } }),
    prisma.orderItem.deleteMany({ where: { id: { in: removeIds } } }),
    ...updates.map((p) => prisma.orderItem.update({ where: { id: p.item.id }, data: { quantity: p.qty, total: p.qty * p.item.price } })),
  ]);

  const remaining = await prisma.orderItem.findMany({ where: { orderId } });
  const changed = await logOrderChanges(orderId, "staff", actor.name ?? "Менеджер", order.items, remaining);
  if (changed.length > 0) {
    await prisma.orderMessage
      .create({ data: { orderId, source: "customer", isFromPicker: true, userId: actor.id, text: await changeChatMessage("staff", actor.name, changed) } })
      .catch((e) => console.error("[pick] chat:", e instanceof Error ? e.message : e));
  }

  // total: Σ lines; with a promo code / bonuses MAXMA recalculates the discounts and the total
  const loyaltyOrder = isMaxmaOrder(order);
  await prisma.order.update({
    where: { id: orderId },
    data: { ...(loyaltyOrder ? {} : { total: orderSums(remaining).total }), customerConfirmed: false },
  });
  if (loyaltyOrder) await recalcOrderLoyalty(orderId).catch((e) => console.error("[pick] loyalty:", e));

  return { changed, emptied: false };
}
