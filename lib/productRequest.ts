import { prisma } from "@/lib/prisma";
import { priceFor, resolveCustomerPriceType } from "@/lib/pricing";

/**
 * «Добавить товар» from the customer's order chat: the customer picks a product (and a quantity) in the
 * catalogue, the chat gets a card the manager can add to the order with one tap. The card is built here
 * from the product id — name, photo and price never come from the customer's phone.
 *
 * Message text: {"_t":"product-request","id":12,"name":"…","variantName":"…"|null,"imagePath":"…"|null,"quantity":3,"price":727}
 */
export type ProductRequestCard = {
  _t: "product-request";
  id: number;
  name: string;
  variantName: string | null;
  imagePath: string | null;
  quantity: number;
  price: number;
  /** the manager added it to the order («Добавить в заказ» on the card) */
  added?: boolean;
};

/** order statuses in which the customer can still ask to add a product */
export const PRODUCT_REQUEST_STATUSES = ["pending", "approved", "assembly", "consultation"];

export async function buildProductRequest(
  customer: { priceType?: string | null },
  input: { productId: unknown; quantity: unknown; variantName?: unknown }
): Promise<ProductRequestCard | { error: string }> {
  const productId = Number(input.productId);
  const quantity = Number(input.quantity);
  if (!Number.isInteger(productId) || productId <= 0) return { error: "Товар не найден" };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return { error: "Укажите количество" };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      prices: { select: { priceType: true, price: true } },
      images: { select: { path: true }, orderBy: { id: "asc" }, take: 1 },
      variants: { select: { name: true, image: { select: { path: true } } } },
    },
  });
  if (!product) return { error: "Товар не найден" };

  // a variant (colour, shade) only when the product really has it
  const wanted = typeof input.variantName === "string" ? input.variantName.trim() : "";
  const variant = wanted ? product.variants.find((v) => v.name === wanted) ?? null : null;
  if (wanted && !variant) return { error: "Такого варианта у товара нет" };

  const pm = Object.fromEntries(product.prices.map((p) => [p.priceType, Number(p.price)]));
  const price = Math.round(
    priceFor({ retailPrice: pm.retail, discountPrice: pm.discount, wholesalePrice: pm.wholesale, bigWholesalePrice: pm.big_wholesale }, resolveCustomerPriceType(customer))
  );

  return {
    _t: "product-request",
    id: product.id,
    name: product.name,
    variantName: variant?.name ?? null,
    imagePath: variant?.image?.path ?? product.images[0]?.path ?? null,
    quantity,
    price,
  };
}

/** The card of message `messageId` (in order `orderId`) → `added: true`. Other messages are left alone. */
export async function markProductRequestAdded(orderId: number, messageId: number): Promise<boolean> {
  const m = await prisma.orderMessage.findFirst({ where: { id: messageId, orderId }, select: { id: true, text: true } });
  if (!m) return false;
  let card: ProductRequestCard;
  try {
    card = JSON.parse(m.text);
  } catch {
    return false;
  }
  if (!card || card._t !== "product-request" || card.added) return false;
  await prisma.orderMessage.update({ where: { id: m.id }, data: { text: JSON.stringify({ ...card, added: true }) } });
  return true;
}
