import { isWholesaleRole } from "@/lib/roles";

/**
 * Wholesale customers (опт, крупный опт) must give the shop's address — staff see it on the order and
 * know where to send it. Asked at registration; an account made before that gives it at checkout.
 */
export const ADDRESS_REQUIRED = "Укажите адрес магазина — без него мы не сможем отправить заказ";

export function needsShopAddress(priceType: string | null | undefined): boolean {
  return isWholesaleRole(priceType);
}

/** trimmed address, or null when it is too short to be a real one */
export function cleanAddress(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, 300);
  return s.length >= 5 ? s : null;
}
