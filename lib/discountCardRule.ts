// Без серверных зависимостей: используется и в браузере (корзина сайта через lib/siteMode.ts).
/**
 * Who gets the discount price («Скидка по карте») for a linked MAXMA card (owner, 2026-11-10): a card whose
 * number starts with «900», or a card whose owner in 1С is in the group «Максма Скидка». Other cards (e.g.
 * «990…») keep retail prices — they still collect bonuses.
 */
export const DISCOUNT_CARD_PREFIX = "900";
export const DISCOUNT_GROUP = "Максма Скидка";

export function cardGivesDiscount(c: { loyaltyCard?: string | null; maxmaDiscount?: boolean | null }): boolean {
  const card = c.loyaltyCard?.replace(/\s/g, "") ?? "";
  if (!card) return false;
  return card.startsWith(DISCOUNT_CARD_PREFIX) || Boolean(c.maxmaDiscount);
}
