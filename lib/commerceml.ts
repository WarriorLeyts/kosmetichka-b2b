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

type Line = { total: number; discount?: number | null };

/** Line discount actually applied (never more than the line total). */
function lineDiscount(item: Line) {
  return Math.min(Math.max(0, item.discount ?? 0), Math.max(0, item.total));
}

/** <Сумма> of a document line: line total minus its promo discount. */
export function cmlItemSum(item: Line): number {
  return item.total - lineDiscount(item);
}

/**
 * <Скидки> block for a document line (standard CommerceML: the discount is already
 * included in the line <Сумма>). Starts with a newline; `indent` is the indentation of
 * the line's other child elements. Empty when the line has no discount.
 */
export function cmlItemDiscounts(item: Line, promoCode: string | null | undefined, indent: string): string {
  const d = lineDiscount(item);
  if (d <= 0) return "";
  const i1 = indent + "  ";
  const i2 = i1 + "  ";
  return `
${indent}<Скидки>
${i1}<Скидка>
${i2}<Наименование>${esc(`Промокод ${promoCode ?? ""}`.trim())}</Наименование>
${i2}<Сумма>${d}</Сумма>
${i2}<УчтеноВСумме>true</УчтеноВСумме>
${i1}</Скидка>
${indent}</Скидки>`;
}

/** Order comment with the promo code appended (unchanged when there is no promo code). */
export function cmlComment(order: { comment: string | null; promoCode?: string | null; discount?: number | null }): string {
  const comment = order.comment || "";
  if (!order.promoCode) return comment;
  const promo = `Промокод ${order.promoCode}, скидка ${order.discount ?? 0} руб.`;
  return comment ? `${comment} | ${promo}` : promo;
}
