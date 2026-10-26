import { prisma } from "@/lib/prisma";
import { effectivePriceType } from "@/lib/pricing";

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
 * effectivePriceType (with auto-upgrade), retail fallback, MOQ / quantity checks.
 * Throws Error with a Russian, customer-facing message on invalid input.
 */
export async function priceOrderItems(
  customer: { priceType?: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[]
): Promise<PricedLine[]> {
  const productIds: number[] = items.map((item) => Number(item.id));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { prices: true },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  // Build flat product representations for effectivePriceType calculation
  const cartForPricing = items.map((item) => {
    const product = productById.get(Number(item.id));
    const priceMap: Record<string, number> = {};
    for (const pp of product?.prices ?? []) {
      priceMap[pp.priceType] = Number(pp.price);
    }
    return {
      wholesalePrice: priceMap["wholesale"] ?? 0,
      bigWholesalePrice: priceMap["big_wholesale"] ?? 0,
      discountPrice: priceMap["discount"] ?? 0,
      retailPrice: priceMap["retail"] ?? 0,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    };
  });

  // Price type = the customer's type (no thresholds; the minimum order is checked in /api/orders)
  const appliedPriceType = effectivePriceType(cartForPricing, customer);

  return items.map((item) => {
    const product = productById.get(Number(item.id));

    if (!product) {
      throw new Error(`Товар ${item.id} не найден`);
    }

    const matchedPrice =
      product.prices.find((p) => p.priceType === appliedPriceType) ??
      // as in priceFor(): big wholesale without its own price → wholesale; guest/discount → retail
      (appliedPriceType === "big_wholesale" ? product.prices.find((p) => p.priceType === "wholesale") : undefined);
    const fallbackPrice = product.prices.find((p) => p.priceType === "retail");

    const rawPrice = matchedPrice?.price ?? fallbackPrice?.price;
    if (!rawPrice || rawPrice <= 0) {
      throw new Error(`Цена для товара «${product.name}» не найдена. Обратитесь к менеджеру.`);
    }
    const price = Math.round(rawPrice);
    const quantity = Math.floor(Number(item.quantity));

    // Explicit non-positive guard (Number(-1) || 0 returns -1, so must check explicitly)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Некорректное количество для «${product.name}»`);
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
