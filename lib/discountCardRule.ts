// Без серверных зависимостей: используется и в браузере (корзина сайта через lib/siteMode.ts).
/** A linked card gives discount prices only when its owner is in 1С «Максма Скидка». */
export const DISCOUNT_GROUP = "Максма Скидка";

export function cardGivesDiscount(c: { loyaltyCard?: string | null; maxmaDiscount?: boolean | null }): boolean {
  const card = c.loyaltyCard?.replace(/\s/g, "") ?? "";
  if (!card) return false;
  return Boolean(c.maxmaDiscount);
}
