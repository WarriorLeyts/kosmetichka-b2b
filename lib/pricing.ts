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

export const NOVEMBER_PROMO = {
  name: "Светлая пятница + ОПТ",
  startsAt: "2026-11-13T00:00:00+03:00",
  endsAt: "2026-12-01T00:00:00+03:00",
  bigWholesaleMin: 25_000,
} as const;

export function novemberPromoActive(now = Date.now()): boolean {
  return now >= Date.parse(NOVEMBER_PROMO.startsAt) && now < Date.parse(NOVEMBER_PROMO.endsAt);
}

export function bigWholesaleMinOrder(now = Date.now()): number {
  return novemberPromoActive(now) ? NOVEMBER_PROMO.bigWholesaleMin : BIG_WHOLESALE_MIN_ORDER;
}

/** The matching 1C promotional price; a missing / zero price keeps the regular tariff. */
export function promotionalPrice(product: any, type: PriceType, now = Date.now()): number | null {
  if (!novemberPromoActive(now)) return null;
  const field = type === "big_wholesale" ? "promoBigWholesalePrice"
    : type === "wholesale" ? "promoWholesalePrice" : "promoRetailPrice";
  const price = Number(product[field]);
  return Number.isFinite(price) && price > 0 ? Math.round(price) : null;
}

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
export function priceFor(product: any, type: PriceType, now = Date.now()): number {
  const special = promotionalPrice(product, type, now);
  if (special !== null) return special;
  // API snapshots retain the ordinary prices so a persisted cart also expires correctly.
  product = product.regularPrices ?? product;
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
export function rawCartTotal(cart: any[], type: PriceType, now = Date.now()): number {
  return cart.reduce(
    (sum, item) => sum + priceFor(item, type, now) * item.quantity,
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
  customer: { priceType?: string | null } | null,
  now = Date.now()
): PriceType {
  const base = resolveCustomerPriceType(customer);
  if (base !== "wholesale") return base;
  if (rawCartTotal(cart, "big_wholesale", now) >= bigWholesaleMinOrder(now)) return "big_wholesale";
  if (rawCartTotal(cart, "wholesale", now) >= WHOLESALE_MIN_ORDER) return "wholesale";
  return "discount";
}

/**
 * Подсказка клиенту «Опт»: какая цена следующая, сколько добрать (в её ценах) и сколько он сэкономит
 * на том, что уже в корзине. null — выше некуда (или клиент не «Опт»).
 */
export function nextPriceTier(
  cart: any[],
  customer: { priceType?: string | null } | null,
  now = Date.now()
): { type: PriceType; need: number; save: number } | null {
  if (resolveCustomerPriceType(customer) !== "wholesale" || cart.length === 0) return null;
  const tier = cartPriceTier(cart, customer, now);
  if (tier === "discount") {
    return {
      type: "wholesale",
      need: Math.max(0, WHOLESALE_MIN_ORDER - rawCartTotal(cart, "wholesale", now)),
      save: Math.max(0, rawCartTotal(cart, "discount", now) - rawCartTotal(cart, "wholesale", now)),
    };
  }
  if (tier === "wholesale") {
    return {
      type: "big_wholesale",
      need: Math.max(0, bigWholesaleMinOrder(now) - rawCartTotal(cart, "big_wholesale", now)),
      save: Math.max(0, rawCartTotal(cart, "wholesale", now) - rawCartTotal(cart, "big_wholesale", now)),
    };
  }
  return null;
}

/** Retail orders start at 1 000 ₽; buying just one loyalty card is allowed at 990 ₽. */
export const RETAIL_MIN_ORDER = 1000;
export function minOrderFor(customer: { priceType?: string | null } | null, items: { quantity?: number | string; cardRegistration?: unknown }[] = []): number {
  if (!["retail", "discount"].includes(customer?.priceType ?? "")) return 0;
  if (items.length === 1 && items[0].cardRegistration && Number(items[0].quantity) === 1) return 0;
  return RETAIL_MIN_ORDER;
}

/** Remaining merchandise amount; actual checkout also applies promo codes server-side. */
export function amountUntilMinOrder(
  cart: any[],
  customer: { priceType?: string | null } | null
): number {
  return Math.max(0, minOrderFor(customer, cart) - calculateCart(cart, customer).total);
}

export type CartPricing = {
  tier: PriceType;
  subtotal: number;
  percent: number;
  eligibleSubtotal: number;
  discount: number;
  discounts: number[];
  total: number;
};

/** Includes shock-price items in the threshold, but never in the extra discount's base. */
export function calculateCart(
  cart: any[], customer: { priceType?: string | null } | null, now = Date.now()
): CartPricing {
  const tier = cartPriceTier(cart, customer, now);
  const totals = cart.map((item) => priceFor(item, tier, now) * item.quantity);
  const subtotal = totals.reduce((sum, n) => sum + n, 0);
  const wholesale = customer?.priceType === "wholesale" || customer?.priceType === "big_wholesale";
  const percent = !wholesale || !novemberPromoActive(now) ? 0
    : subtotal >= 300_000 ? 5 : subtotal >= 100_000 ? 3 : subtotal >= 40_000 ? 2 : 0;
  const eligible = totals.map((n, i) => promotionalPrice(cart[i], tier, now) === null ? n : 0);
  // Work in kopecks. Allocate the rounding remainder once across lines so splitting a product
  // into variants cannot change the discount or make Σ(line discounts) differ from the order.
  const raw = eligible.map((n) => n * percent);
  const cents = raw.map(Math.floor);
  const wanted = Math.round(raw.reduce((sum, n) => sum + n, 0));
  const order = raw.map((n, i) => ({ i, fraction: n - cents[i] })).sort((a, b) => b.fraction - a.fraction);
  let remaining = wanted - cents.reduce((sum, n) => sum + n, 0);
  for (const { i } of order) if (remaining > 0 && eligible[i] > 0) { cents[i]++; remaining--; }
  const discount = wanted / 100;
  return { tier, subtotal, percent, eligibleSubtotal: eligible.reduce((sum, n) => sum + n, 0),
    discount, discounts: cents.map((n) => n / 100), total: Math.round((subtotal - discount) * 100) / 100 };
}

/** Whitelisted price metadata for saved carts / favourites; checkout always reloads real DB prices. */
export function cleanPromoSnapshot(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const copy = (from: Record<string, unknown>, to: Record<string, unknown>, fields: string[]) => {
    for (const k of fields) {
      const n = from[k];
      if (n === null || (typeof n === "number" && Number.isFinite(n))) to[k] = n;
    }
  };
  copy(raw, out, ["promoRetailPrice", "promoWholesalePrice", "promoBigWholesalePrice"]);
  if (raw.regularPrices && typeof raw.regularPrices === "object" && !Array.isArray(raw.regularPrices)) {
    const regular: Record<string, unknown> = {};
    copy(raw.regularPrices as Record<string, unknown>, regular, ["retailPrice", "discountPrice", "wholesalePrice", "bigWholesalePrice"]);
    if (Object.keys(regular).length > 0) out.regularPrices = regular;
  }
  return out;
}

