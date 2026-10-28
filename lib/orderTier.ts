import { prisma } from "@/lib/prisma";
import { cartPriceTier, priceFor, resolveCustomerPriceType, type PriceType } from "@/lib/pricing";

/**
 * «Опт» customers pay by the order sum (lib/pricing.ts cartPriceTier): less than 5 000 ₽ — the discount
 * price, from 5 000 ₽ — wholesale, from 50 000 ₽ — big wholesale. When the manager changes the order
 * (adds / removes products, the assembly takes out what is missing) the sum moves and the price may change:
 * then every line gets the new tier's price. Other customers keep their own type — nothing changes.
 */

const TIER_TEXT: Record<string, string> = {
  discount: "Сумма заказа меньше 5 000 ₽ — цены пересчитаны по скидочной цене.",
  wholesale: "Сумма заказа от 5 000 ₽ — цены пересчитаны по оптовой цене.",
  big_wholesale: "Сумма заказа от 50 000 ₽ — цены пересчитаны по крупнооптовой цене.",
};

/** The tier the order's lines are at now (old orders: the customer's type at ordering). */
export function orderTier(order: { priceTier?: string | null; priceType?: string | null; customer?: { priceType?: string | null } | null }): PriceType {
  if (order.priceTier) return order.priceTier as PriceType;
  return resolveCustomerPriceType({ priceType: order.priceType ?? order.customer?.priceType ?? null });
}

type FlatPrices = { retailPrice: number; discountPrice: number; wholesalePrice: number; bigWholesalePrice: number };

/**
 * Re-checks the price tier of order `orderId` after a change; on a new tier every line is re-priced.
 * Returns the chat text for the customer when the tier changed (null — nothing changed).
 */
export async function repriceOrder(orderId: number): Promise<{ from: PriceType; to: PriceType; text: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: { select: { priceType: true } } },
  });
  if (!order || order.items.length === 0) return null;
  const base = resolveCustomerPriceType({ priceType: order.priceType ?? order.customer?.priceType ?? null });
  if (base !== "wholesale") return null;

  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(order.items.map((i) => i.productId))] } },
    select: { id: true, prices: { select: { priceType: true, price: true } } },
  });
  const flat = new Map<number, FlatPrices>(
    products.map((p) => {
      const m = Object.fromEntries(p.prices.map((x) => [x.priceType, Number(x.price)]));
      return [p.id, { retailPrice: m.retail ?? 0, discountPrice: m.discount ?? 0, wholesalePrice: m.wholesale ?? 0, bigWholesalePrice: m.big_wholesale ?? 0 }];
    })
  );
  // a product no longer in the catalogue keeps its line price for every tier
  const cart = order.items.map((i) => {
    const f = flat.get(i.productId);
    return f ? { ...f, quantity: i.quantity } : { retailPrice: i.price, discountPrice: i.price, wholesalePrice: i.price, bigWholesalePrice: i.price, quantity: i.quantity };
  });
  const to = cartPriceTier(cart, { priceType: "wholesale" });
  const from = orderTier(order);
  if (to === from) return null;

  await prisma.$transaction([
    ...order.items.map((i) => {
      const f = flat.get(i.productId);
      const price = f ? Math.round(priceFor(f, to)) || i.price : i.price;
      return prisma.orderItem.update({ where: { id: i.id }, data: { price, total: price * i.quantity } });
    }),
    prisma.order.update({ where: { id: orderId }, data: { priceTier: to } }),
  ]);
  return { from, to, text: TIER_TEXT[to] ?? "Цены заказа пересчитаны." };
}
