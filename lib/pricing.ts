/**
 * Centralised pricing logic.
 *
 * Тарифы:
 *   guest        → discountPrice ?? retailPrice   (не авторизован)
 *   discount     → discountPrice ?? retailPrice   (всегда, без апгрейда)
 *   wholesale    → порог корзины: < 5 000 → discount, >= 5 000 → wholesale,
 *                  >= 50 000 → big_wholesale
 *   big_wholesale → bigWholesalePrice              (всегда)
 */

export const WHOLESALE_THRESHOLD = 5_000;
export const BIG_WHOLESALE_THRESHOLD = 50_000;

export type PriceType = "guest" | "retail" | "discount" | "wholesale" | "big_wholesale";

/** Базовый тариф клиента (без учёта корзины). */
export function resolveCustomerPriceType(
  customer: { priceType?: string | null } | null
): PriceType {
  if (!customer) return "guest";
  if (customer.priceType === "big_wholesale") return "big_wholesale";
  if (customer.priceType === "wholesale") return "wholesale";
  if (customer.priceType === "retail") return "retail";
  return "discount";
}

/** Человекочитаемый ярлык тарифа. */
export function priceTypeLabel(type: PriceType): string {
  switch (type) {
    case "big_wholesale": return "Крупный опт";
    case "wholesale":     return "Опт";
    case "retail":        return "Розница";
    case "discount":      return "Скидка";
    default:              return "Цена";
  }
}

/** Цена одного товара по тарифу. */
export function priceFor(product: any, type: PriceType): number {
  if (type === "retail") {
    return Number(product.retailPrice ?? 0);
  }
  if (type === "guest" || type === "discount") {
    return Number(product.discountPrice ?? product.retailPrice ?? 0);
  }
  if (type === "big_wholesale") {
    return Number(product.bigWholesalePrice ?? product.wholesalePrice ?? 0);
  }
  return Number(product.wholesalePrice ?? 0);
}

/** Сумма корзины по тарифу (без авто-апгрейда). */
export function rawCartTotal(cart: any[], type: PriceType): number {
  return cart.reduce(
    (sum, item) => sum + priceFor(item, type) * item.quantity,
    0
  );
}

/**
 * Эффективный тариф для корзины / оформления заказа.
 * Авто-апгрейд считается по оптовой сумме корзины.
 */
export function effectivePriceType(
  cart: any[],
  customer: { priceType?: string | null } | null
): PriceType {
  const base = resolveCustomerPriceType(customer);

  if (base === "guest")         return "guest";
  if (base === "retail")        return "retail";        // всегда розничная цена
  if (base === "big_wholesale") return "big_wholesale";

  // Скидочные клиенты — всегда скидочная цена, апгрейда нет
  if (base === "discount") return "discount";

  // Оптовые клиенты — порог по сумме корзины в оптовых ценах
  const wholesaleTotal = rawCartTotal(cart, "wholesale");
  if (wholesaleTotal >= BIG_WHOLESALE_THRESHOLD) return "big_wholesale";
  if (wholesaleTotal >= WHOLESALE_THRESHOLD)     return "wholesale";

  return "discount";
}

/**
 * Сколько рублей осталось до тарифа «Опт».
 * Возвращает 0, если уже достигнуто или не применимо.
 */
export function amountUntilWholesale(
  cart: any[],
  customer: { priceType?: string | null } | null
): number {
  const base = resolveCustomerPriceType(customer);
  // Только для оптовых клиентов, не достигших порога wholesale
  if (base !== "wholesale") return 0;
  const total = rawCartTotal(cart, "wholesale");
  return Math.max(0, WHOLESALE_THRESHOLD - total);
}

/**
 * Сколько рублей осталось до тарифа «Крупный опт».
 * Возвращает 0, если уже достигнуто или не применимо.
 */
export function amountUntilBigWholesale(
  cart: any[],
  customer: { priceType?: string | null } | null
): number {
  const base = resolveCustomerPriceType(customer);
  if (base === "big_wholesale" || base === "guest") return 0;
  const total = rawCartTotal(cart, "wholesale");
  return Math.max(0, BIG_WHOLESALE_THRESHOLD - total);
}
