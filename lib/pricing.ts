/**
 * Centralised pricing logic (the apps keep an identical copy in src/pricing.ts).
 *
 * Тарифы:
 *   guest         → discountPrice ?? retailPrice   (не авторизован)
 *   retail        → retailPrice                    (бонусная карта MAXMA: бонусы начисляются и списываются)
 *   discount      → discountPrice ?? retailPrice   (скидочная карта MAXMA: бонусы тоже работают)
 *   wholesale     → цена по сумме заказа (cartPriceTier), без бонусов:
 *                     от 50 000 ₽ в крупнооптовых ценах → bigWholesalePrice,
 *                     от 5 000 ₽ в оптовых ценах        → wholesalePrice,
 *                     меньше                            → discountPrice ?? retailPrice
 *   big_wholesale → bigWholesalePrice при любой сумме (крупный опт, назначенный менеджером), без бонусов
 *
 * Каталог показывает цены по типу клиента (effectivePriceType), корзина и заказ — по сумме (cartPriceTier).
 */

/** Пороги цены для клиента «Опт»: от 5 000 ₽ в оптовых ценах — опт, от 50 000 ₽ в крупнооптовых — крупный опт. */
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
    case "discount":      return "Скидка по карте";
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
      // whole roubles, as the order is priced (lib/orderPricing.ts rounds each unit price)
      if (Number.isFinite(n) && n > 0) return Math.round(n);
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
 * Тариф для каталога — тип клиента (оптовому клиенту каталог показывает оптовые цены).
 * Корзина и заказ считаются по cartPriceTier.
 */
export function effectivePriceType(
  _cart: any[],
  customer: { priceType?: string | null } | null
): PriceType {
  return resolveCustomerPriceType(customer);
}

/**
 * Цена корзины / заказа. Клиент «Опт» — по сумме: от 50 000 ₽ (в крупнооптовых ценах) — крупный опт,
 * от 5 000 ₽ (в оптовых) — опт, меньше — скидочная цена. Остальные — по своему типу.
 */
export function cartPriceTier(
  cart: any[],
  customer: { priceType?: string | null } | null
): PriceType {
  const base = resolveCustomerPriceType(customer);
  if (base !== "wholesale") return base;
  if (rawCartTotal(cart, "big_wholesale") >= BIG_WHOLESALE_MIN_ORDER) return "big_wholesale";
  if (rawCartTotal(cart, "wholesale") >= WHOLESALE_MIN_ORDER) return "wholesale";
  return "discount";
}

/**
 * Подсказка клиенту «Опт»: какая цена следующая, сколько добрать (в её ценах) и сколько он сэкономит
 * на том, что уже в корзине. null — выше некуда (или клиент не «Опт»).
 */
export function nextPriceTier(
  cart: any[],
  customer: { priceType?: string | null } | null
): { type: PriceType; need: number; save: number } | null {
  if (resolveCustomerPriceType(customer) !== "wholesale" || cart.length === 0) return null;
  const tier = cartPriceTier(cart, customer);
  if (tier === "discount") {
    return {
      type: "wholesale",
      need: Math.max(0, WHOLESALE_MIN_ORDER - rawCartTotal(cart, "wholesale")),
      save: Math.max(0, rawCartTotal(cart, "discount") - rawCartTotal(cart, "wholesale")),
    };
  }
  if (tier === "wholesale") {
    return {
      type: "big_wholesale",
      need: Math.max(0, BIG_WHOLESALE_MIN_ORDER - rawCartTotal(cart, "big_wholesale")),
      save: Math.max(0, rawCartTotal(cart, "wholesale") - rawCartTotal(cart, "big_wholesale")),
    };
  }
  return null;
}

/** Минимальной суммы заказа больше нет: маленький заказ клиента «Опт» идёт по скидочной цене. */
export function minOrderFor(_customer: { priceType?: string | null } | null): number {
  return 0;
}

/** Сколько не хватает до минимальной суммы — всегда 0 (минимума нет, см. cartPriceTier). */
export function amountUntilMinOrder(
  _cart: any[],
  _customer: { priceType?: string | null } | null
): number {
  return 0;
}
