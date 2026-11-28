/** Zero prices on a franchise order mean pending 1C pricing, never a free sale. */
export function pendingFranchiseOrder(order: { priceType?: string | null; priceTier?: string | null; items?: { price: number }[] }) {
  return (order.priceTier ?? order.priceType) === "franchise" && !!order.items?.some(i => i.price <= 0);
}

/** Saved lists may contain an old privileged snapshot; removing access hides it on every device. */
export function maskFranchiseSnapshot(item: Record<string, unknown>, allowed: boolean): Record<string, unknown> {
  if (allowed) return item;
  const rest = { ...item };
  const regularPrices = rest.regularPrices;
  delete rest.franchisePrice;
  if (!regularPrices || typeof regularPrices !== "object") return rest;
  const ordinary = { ...regularPrices as Record<string, unknown> };
  delete ordinary.franchisePrice;
  return { ...rest, regularPrices: ordinary };
}
