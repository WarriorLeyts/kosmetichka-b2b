// Order comment for 1С with the promo code / spent bonuses — the same text as cmlComment in lib/commerceml.ts
// (a test keeps them equal).
export function cmlComment(order) {
  const comment = order.comment || "";
  const bonuses = Math.max(0, order.bonusesApplied ?? 0);
  if (!order.promoCode && bonuses <= 0) return comment;
  const parts = [];
  if (order.promoCode) parts.push(`Промокод ${order.promoCode}, скидка ${order.discount ?? 0} руб.`);
  if (bonuses > 0) parts.push(order.promoCode ? `списано бонусов ${bonuses}` : `Списано бонусов ${bonuses}`);
  const loyalty = parts.join(", ");
  return comment ? `${comment} | ${loyalty}` : loyalty;
}
