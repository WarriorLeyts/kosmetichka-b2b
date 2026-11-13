import { prisma } from "@/lib/prisma";
import { calculateCart, cartItemPrice, type PriceType, type CartPricing } from "@/lib/pricing";
import { customerStock, withFlatPrices } from "@/lib/utils";

/** the most pieces of one product in an order line */
export const MAX_LINE_QTY = 9999;

/** Cart line as the site / apps send it to POST /api/orders. */
export type OrderItemInput = {
  id: number | string;
  quantity: number | string;
  variantName?: string | null;
  variantImageUrl?: string | null;
};

/** A cart line priced server-side — the OrderItem data (plus `sku` for MAXMA). */
export type PricedLine = {
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  total: number;
  variantName: string | null;
  variantImageUrl: string | null;
  /** Product guid (falls back to id) — the SKU MAXMA knows the product by */
  sku: string;
};

/**
 * Prices the cart for a customer exactly like order creation does: price tier by
 * cartPriceTier («Опт» — by the order sum), retail fallback, MOQ / quantity checks.
 * Throws Error with a Russian, customer-facing message on invalid input.
 */
export async function priceOrderItems(
  customer: { priceType?: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[]
): Promise<PricedLine[]> {
  const order = await priceOrder(customer, items);
  return loyaltyLines(order.lines, order.pricing);
}

/** MAXMA sees what is left after the automatic wholesale discount, so it cannot spend it twice. */
export function loyaltyLines(lines: PricedLine[], pricing: CartPricing): PricedLine[] {
  return lines.map((line, i) => {
    const total = Math.round((line.total - (pricing.discounts[i] ?? 0)) * 100) / 100;
    return { ...line, total, price: total / line.quantity };
  });
}

/** priceOrderItems + the price tier the lines got. */
export async function priceOrder(
  customer: { priceType?: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[]
): Promise<{ lines: PricedLine[]; tier: PriceType; pricing: CartPricing }> {
  const now = Date.now();
  const productIds: number[] = items.map((item) => Number(item.id));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { prices: true },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  // Build flat product representations for effectivePriceType calculation
  const cartForPricing = items.map((item) => {
    const product = productById.get(Number(item.id));
    return {
      ...withFlatPrices(product ?? { prices: [] }),
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    };
  });

  // «Опт»: the price by the order sum (5 000 / 50 000 ₽); the other types: the customer's own
  const pricing = calculateCart(cartForPricing, customer, now);
  const appliedPriceType = pricing.tier;

  const qtyByProduct = new Map<number, number>();
  for (const item of items) {
    const q = Math.floor(Number(item.quantity));
    if (Number.isFinite(q) && q > 0) qtyByProduct.set(Number(item.id), (qtyByProduct.get(Number(item.id)) ?? 0) + q);
  }

  const lines = items.map((item, index) => {
    const product = productById.get(Number(item.id));

    if (!product) {
      throw new Error(`Товар ${item.id} не найден`);
    }

    // as in priceFor(): a missing / zero price falls back — big wholesale → wholesale → retail
    const price = cartItemPrice(cartForPricing[index], appliedPriceType, customer, now);
    if (price <= 0) {
      throw new Error(`Цена для товара «${product.name}» не найдена. Обратитесь к менеджеру.`);
    }
    const quantity = Math.floor(Number(item.quantity));

    // Explicit non-positive guard (Number(-1) || 0 returns -1, so must check explicitly)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Некорректное количество для «${product.name}»`);
    }
    // a typo like 1000000 must not reach the order, 1C and the invoice
    if (quantity > MAX_LINE_QTY) {
      throw new Error(`Слишком большое количество для «${product.name}»: не больше ${MAX_LINE_QTY} шт. в одной позиции`);
    }

    // no more than the customer may take (audit BUG-01): wholesalers — the shop minus its 12 + the
    // warehouse (Product.wholesaleStock), the others — the stock; the same product in several lines
    // (variants) counts together. Unknown stock (null) — not checked, as before.
    const available = customerStock(product.stock, customer.priceType, product.wholesaleStock);
    if (available != null) {
      const have = Math.max(0, Math.floor(Number(available)));
      if (have <= 0) throw new Error(`«${product.name}» нет в наличии. Удалите этот товар из корзины.`);
      const wanted = qtyByProduct.get(product.id) ?? quantity;
      if (wanted > have) throw new Error(`«${product.name}»: в наличии ${have} шт. Уменьшите количество в корзине.`);
    }

    // MOQ check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const minQty = (product as any).minOrderQty ?? 1;
    if (quantity < minQty) {
      throw new Error(`Минимальное количество для «${product.name}» — ${minQty} шт.`);
    }

    return {
      productId: product.id,
      productName: product.name,
      barcode: product.barcode || null,
      quantity,
      price,
      total: price * quantity,
      variantName: item.variantName ?? null,
      variantImageUrl: item.variantImageUrl ?? null,
      sku: product.guid || String(product.id),
    };
  });
  return { lines, tier: appliedPriceType, pricing };
}

/**
 * Order sums from its lines after an edit: the promo discount of a line never exceeds
 * the line total, the bonus discount never exceeds what is left;
 * order total = Σ(line total − line discount − line bonus discount).
 */
export function orderSums(lines: { total: number; discount?: number | null; bonusDiscount?: number | null }[]) {
  let total = 0;
  let discount = 0;
  let bonuses = 0;
  for (const l of lines) {
    const d = Math.min(Math.max(0, l.discount ?? 0), Math.max(0, l.total));
    const b = Math.min(Math.max(0, l.bonusDiscount ?? 0), Math.max(0, l.total - d));
    total += l.total - d - b;
    discount += d;
    bonuses += b;
  }
  return { total, discount, bonuses };
}

