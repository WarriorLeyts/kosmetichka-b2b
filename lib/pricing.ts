/**
 * Centralised pricing logic.
 *
 * Price-type resolution (from customer.priceType):
 *   wholesale        → wholesalePrice   (Опт)
 *   big_wholesale    → bigWholesalePrice (Крупный опт, falls back to wholesale)
 *   null/retail/any  → wholesalePrice   (treat as wholesale)
 *   guest (no login) → discountPrice ?? retailPrice
 *
 * Auto-upgrade rule:
 *   If the customer's base priceType is not already big_wholesale AND
 *   the cart sub-total (at their base prices) reaches BIG_WHOLESALE_THRESHOLD,
 *   all prices automatically switch to big_wholesale for that cart session.
 */

export const BIG_WHOLESALE_THRESHOLD = 5000;

export type PriceType = "wholesale" | "big_wholesale" | "guest";

/** Maps the raw DB priceType string to our internal enum. */
export function resolveCustomerPriceType(
  customer: { priceType?: string | null } | null
): PriceType {
  if (!customer) return "guest";
  if (customer.priceType === "big_wholesale") return "big_wholesale";
  // wholesale / null / retail / discount → all get standard wholesale
  return "wholesale";
}

/** Human-readable label for a price type. */
export function priceTypeLabel(type: PriceType): string {
  if (type === "big_wholesale") return "Крупный опт";
  if (type === "wholesale") return "Опт";
  return "Цена";
}

/** Price for one product given an effective price type. */
export function priceFor(product: any, type: PriceType): number {
  if (type === "guest") {
    return Number(product.discountPrice ?? product.retailPrice ?? 0);
  }
  if (type === "big_wholesale") {
    return Number(product.bigWholesalePrice ?? product.wholesalePrice ?? 0);
  }
  return Number(product.wholesalePrice ?? 0);
}

/** Raw cart total at the given price type (no threshold logic). */
export function rawCartTotal(cart: any[], type: PriceType): number {
  return cart.reduce(
    (sum, item) => sum + priceFor(item, type) * item.quantity,
    0
  );
}

/**
 * Effective price type for display/checkout.
 * Upgrades to big_wholesale if the wholesale total hits the threshold.
 */
export function effectivePriceType(
  cart: any[],
  customer: { priceType?: string | null } | null
): PriceType {
  const base = resolveCustomerPriceType(customer);
  if (base === "big_wholesale") return "big_wholesale";
  if (base === "guest") return "guest";
  // Check if the cart qualifies for big_wholesale
  const total = rawCartTotal(cart, base);
  if (total >= BIG_WHOLESALE_THRESHOLD) return "big_wholesale";
  return base;
}

/**
 * How many roubles remain until the big-wholesale threshold.
 * Returns 0 if already at or above threshold (or already big_wholesale customer).
 */
export function amountUntilBigWholesale(
  cart: any[],
  customer: { priceType?: string | null } | null
): number {
  const base = resolveCustomerPriceType(customer);
  if (base === "big_wholesale" || base === "guest") return 0;
  const total = rawCartTotal(cart, base);
  return Math.max(0, BIG_WHOLESALE_THRESHOLD - total);
}
