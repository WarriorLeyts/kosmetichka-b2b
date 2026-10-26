/**
 * Centralised pricing logic (the apps keep an identical copy in src/pricing.ts).
 *
 * Тарифы — цена сразу по типу клиента, без порогов по сумме корзины:
 *   guest         → discountPrice ?? retailPrice   (не авторизован)
 *   retail        → retailPrice                    (бонусная карта MAXMA: бонусы начисляются и списываются)
 *   discount      → discountPrice ?? retailPrice   (скидочная карта MAXMA: бонусы тоже работают)
 *   wholesale     → wholesalePrice                 (без бонусов), заказ от 5 000 ₽
 *   big_wholesale → bigWholesalePrice              (без бонусов), заказ от 50 000 ₽
 */

/** Минимальная сумма заказа для опта и крупного опта (в ценах клиента). */
export const WHOLESALE_MIN_ORDER = 5_000;
export const BIG_WHOLESALE_MIN_ORDER = 50_000;

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

/**
 * Цена одного товара по тарифу. Нет своей цены (0 / пусто) — следующая по цепочке,
 * так же считает сервер при оформлении (lib/orderPricing.ts):
 *   крупный опт → опт → розница, опт → розница, скидка / гость → розница.
 */
export function priceFor(product: any, type: PriceType): number {
  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };
  if (type === "retail") return pick(product.retailPrice);
  if (type === "guest" || type === "discount") return pick(product.discountPrice, product.retailPrice);
  if (type === "big_wholesale") return pick(product.bigWholesalePrice, product.wholesalePrice, product.retailPrice);
  return pick(product.wholesalePrice, product.retailPrice);
}

/** Сумма корзины по тарифу (без авто-апгрейда). */
export function rawCartTotal(cart: any[], type: PriceType): number {
  return cart.reduce(
    (sum, item) => sum + priceFor(item, type) * item.quantity,
    0
  );
}

/**
 * Тариф для корзины / оформления заказа — всегда тип клиента
 * (корзина оставлена в параметрах для совместимости вызовов).
 */
export function effectivePriceType(
  _cart: any[],
  customer: { priceType?: string | null } | null
): PriceType {
  return resolveCustomerPriceType(customer);
}

/** Минимальная сумма заказа для клиента (0 — без минимума). */
export function minOrderFor(customer: { priceType?: string | null } | null): number {
  const base = resolveCustomerPriceType(customer);
  if (base === "big_wholesale") return BIG_WHOLESALE_MIN_ORDER;
  if (base === "wholesale") return WHOLESALE_MIN_ORDER;
  return 0;
}

/**
 * Сколько рублей не хватает до минимальной суммы заказа (в ценах клиента).
 * 0 — можно оформлять.
 */
export function amountUntilMinOrder(
  cart: any[],
  customer: { priceType?: string | null } | null
): number {
  const min = minOrderFor(customer);
  if (!min) return 0;
  const total = rawCartTotal(cart, resolveCustomerPriceType(customer));
  return Math.max(0, min - total);
}
