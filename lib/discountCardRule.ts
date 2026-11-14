// Shared pure rules: a card's number never determines its kind.
export const DISCOUNT_GROUP = "Максма Скидка";
export const BONUS_GROUP = "Максма Розница";
export type CardKind = "discount" | "bonus";
export function cardGivesDiscount(c: { loyaltyCard?: string | null; maxmaDiscount?: boolean | null; maxmaRetail?: boolean | null }): boolean {
  return cardKind(c) === "discount";
}
export function cardKind(c: { loyaltyCard?: string | null; maxmaDiscount?: boolean | null; maxmaRetail?: boolean | null }): CardKind | null {
  if (!c.loyaltyCard?.trim()) return null;
  if (c.maxmaDiscount && !c.maxmaRetail) return "discount";
  if (c.maxmaRetail && !c.maxmaDiscount) return "bonus";
  return null;
}
