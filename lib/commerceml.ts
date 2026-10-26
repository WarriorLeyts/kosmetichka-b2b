/**
 * Promo-code bits of the CommerceML order export (1C). Without a promo code every
 * helper returns exactly what the export had before (empty string / original value).
 */

function esc(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Line = { total: number; discount?: number | null; bonusDiscount?: number | null };

/** Line discount actually applied (never more than the line total). */
function lineDiscount(item: Line) {
  return Math.min(Math.max(0, item.discount ?? 0), Math.max(0, item.total));
}

/** Line bonus discount actually applied (never more than what the promo discount leaves). */
function lineBonusDiscount(item: Line) {
  return Math.min(Math.max(0, item.bonusDiscount ?? 0), Math.max(0, item.total - lineDiscount(item)));
}

/** <Сумма> of a document line: line total minus its promo and bonus discounts. */
export function cmlItemSum(item: Line): number {
  return item.total - lineDiscount(item) - lineBonusDiscount(item);
}

function discountXml(name: string, amount: number, i1: string) {
  const i2 = i1 + "  ";
  return `
${i1}<Скидка>
${i2}<Наименование>${esc(name)}</Наименование>
${i2}<Сумма>${amount}</Сумма>
${i2}<УчтеноВСумме>true</УчтеноВСумме>
${i1}</Скидка>`;
}

/**
 * <Скидки> block for a document line (standard CommerceML: the discounts are already
 * included in the line <Сумма>): «Промокод CODE» and «Бонусы MAXMA». Starts with a newline;
 * `indent` is the indentation of the line's other child elements. Empty when the line has
 * no discount.
 */
export function cmlItemDiscounts(item: Line, promoCode: string | null | undefined, indent: string): string {
  const d = lineDiscount(item);
  const b = lineBonusDiscount(item);
  if (d <= 0 && b <= 0) return "";
  const i1 = indent + "  ";
  return `
${indent}<Скидки>${d > 0 ? discountXml(`Промокод ${promoCode ?? ""}`.trim(), d, i1) : ""}${b > 0 ? discountXml("Бонусы MAXMA", b, i1) : ""}
${indent}</Скидки>`;
}

/** Order comment with the promo code / spent bonuses appended (unchanged without them). */
export function cmlComment(order: {
  comment: string | null;
  promoCode?: string | null;
  discount?: number | null;
  bonusesApplied?: number | null;
}): string {
  const comment = order.comment || "";
  const bonuses = Math.max(0, order.bonusesApplied ?? 0);
  if (!order.promoCode && bonuses <= 0) return comment;
  const parts: string[] = [];
  if (order.promoCode) parts.push(`Промокод ${order.promoCode}, скидка ${order.discount ?? 0} руб.`);
  if (bonuses > 0) parts.push(order.promoCode ? `списано бонусов ${bonuses}` : `Списано бонусов ${bonuses}`);
  const loyalty = parts.join(", ");
  return comment ? `${comment} | ${loyalty}` : loyalty;
}

/** The order needs cmlComment (promo code or spent bonuses). */
export function cmlHasLoyalty(order: { promoCode?: string | null; bonusesApplied?: number | null }): boolean {
  return Boolean(order.promoCode) || (order.bonusesApplied ?? 0) > 0;
}
