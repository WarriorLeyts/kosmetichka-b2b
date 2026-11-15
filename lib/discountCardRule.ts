// Shared pure rules: a card's number never determines its kind.
export const DISCOUNT_GROUP = "Максма Скидка";
/** Verified from the owner's 1C navigation link; remains stable when the folder is renamed. */
export const DISCOUNT_GROUP_REF = "389de726-0d78-11f1-80c4-10ffe0cbb38c";
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
