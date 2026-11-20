import { getCampaign } from "./campaignSettings";
import { withFlatPrices } from "./utils";
import { prisma } from "@/lib/prisma";
import { bigWholesaleMinOrder, wholesaleMinOrder, cartPriceTier, priceFor, resolveCustomerPriceType, type PriceType } from "@/lib/pricing";
import { CARD_PRICE, CARD_PRODUCT_NAME, isCardProduct } from "./cardPurchase";
import { cardGivesDiscount } from "./discountCardRule";

/**
 * «Опт» customers pay by the order sum (lib/pricing.ts cartPriceTier): less than 5 000 ₽ — the discount
 * price, from 5 000 ₽ — wholesale, from 50 000 ₽ — big wholesale. When the manager changes the order
 * (adds / removes products, the assembly takes out what is missing) the sum moves and the price may change:
 * then every line gets the new tier's price. Other customers keep their own type — nothing changes.
 */

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
    include: { items: true, customer: { select: { priceType: true, loyaltyCard: true, maxmaDiscount: true } } },
  });
  if (!order || order.items.length === 0) return null;
  const base = resolveCustomerPriceType({ priceType: order.priceType ?? order.customer?.priceType ?? null });
  const registrationPrefix = "Оформить скидочную карту «Косметичка»";
  const retailPurchase = base === "retail" && (order.comment?.includes(registrationPrefix) || order.items.some(i => i.productName === CARD_PRODUCT_NAME));
  if (base !== "wholesale" && !retailPurchase) return null;

  const campaign = await getCampaign();
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(order.items.map((i) => i.productId))] } },
    select: { id: true, guid: true, name: true, prices: { select: { priceType: true, price: true } } },
  });
  const flat = new Map<number, FlatPrices>(
    products.map((p) => {
      return [p.id, withFlatPrices(p, campaign) as FlatPrices];
    })
  );
  // a product no longer in the catalogue keeps its line price for every tier
  const cart = order.items.map((i) => {
    const f = flat.get(i.productId);
    return f ? { ...f, quantity: i.quantity } : { retailPrice: i.price, discountPrice: i.price, wholesalePrice: i.price, bigWholesalePrice: i.price, quantity: i.quantity };
  });
  const cardIds = new Set(products.filter(isCardProduct).map(p => p.id));
  const hasPurchase = order.items.some(i => cardIds.has(i.productId) || i.productName === CARD_PRODUCT_NAME);
  const to = retailPurchase ? hasPurchase || cardGivesDiscount(order.customer) ? "discount" : "retail" : cartPriceTier(cart, { priceType: "wholesale" }, Date.now(), campaign);
  const from = orderTier(order);
  if (to === from) {
    if (retailPurchase && !hasPurchase) await prisma.order.update({ where: { id: orderId }, data: { comment: order.comment?.split("\n").filter(line => !line.startsWith(registrationPrefix)).join("\n") || null } });
    return null;
  }

  await prisma.$transaction([
    ...order.items.map((i) => {
      const f = flat.get(i.productId);
      const price = retailPurchase && (cardIds.has(i.productId) || i.productName === CARD_PRODUCT_NAME) ? CARD_PRICE : f ? Math.round(priceFor(f, to, Date.now(), campaign)) || i.price : i.price;
      return prisma.orderItem.update({ where: { id: i.id }, data: { price, total: price * i.quantity } });
    }),
    prisma.order.update({ where: { id: orderId }, data: { priceTier: to, ...(retailPurchase && !hasPurchase ? { comment: order.comment?.split("\n").filter(line => !line.startsWith(registrationPrefix)).join("\n") || null } : {}) } }),
  ]);
  if (retailPurchase) return { from, to, text: hasPurchase ? "В заказе есть карта «Косметичка» — товары пересчитаны по скидочным ценам." : "Покупка карты удалена — товары пересчитаны по действующим ценам клиента." };
  return { from, to, text: to === "big_wholesale" ? `Сумма заказа от ${bigWholesaleMinOrder(Date.now(), campaign).toLocaleString("ru-RU")} ₽ — цены пересчитаны по крупнооптовой цене.` : to === "wholesale" ? `Сумма заказа от ${wholesaleMinOrder(Date.now(), campaign).toLocaleString("ru-RU")} ₽ — цены пересчитаны по оптовой цене.` : `Сумма заказа меньше ${wholesaleMinOrder(Date.now(), campaign).toLocaleString("ru-RU")} ₽ — цены пересчитаны по скидочной цене.` };
}
