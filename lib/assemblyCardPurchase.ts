import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { CARD_PRICE, CARD_PRODUCT_NAME, cardOrderComment, cardRegistration, isCardProduct } from "./cardPurchase";
import { findCardCatalogProduct } from "./cardCatalog";
import { getCampaign } from "./campaignSettings";
import { withFlatPrices } from "./utils";
import { priceFor } from "./pricing";
import { calcLoyalty, maxmaConfigured, maxmaPhone, setOrderQuery, type LoyaltyResult } from "./maxma";
import { cardGivesDiscount } from "./discountCardRule";
import { runOrderMaxmaTasks } from "./maxmaQueue";
import { logOrderChanges } from "./orderChanges";

export class CardPurchaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
/** Called under the existing order lock. Purchase only: issuance/linking is done by the cashier. */
export async function purchaseAssemblyCard(orderId: number, rawRegistration: unknown, staff: { id: number; login: string }) {
  const registration = cardRegistration(rawRegistration);
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } }, customer: true } });
  if (!order) throw new CardPurchaseError("Заказ не найден", 404);
  if (order.status !== "assembly" || order.oneCExportedAt || order.oneCSendingAt || order.oneCRef || order.oneCStockRef) throw new CardPurchaseError("Карту можно добавить только во время сборки, до передачи заказа в 1С.", 409);
  const customer = order.customer;
  if (!["retail", "discount"].includes(customer.priceType ?? "") || !["retail", "discount"].includes(order.priceType ?? customer.priceType) || cardGivesDiscount(customer)) throw new CardPurchaseError("Покупка карты доступна розничному клиенту без скидочной карты.", 409);
  const phone = maxmaPhone(customer.phone ?? "");
  if (!phone) throw new CardPurchaseError("Для оформления карты укажите российский телефон в аккаунте клиента.");
  const cardProduct = await findCardCatalogProduct();
  if (order.items.some(i => i.productId === cardProduct.id || isCardProduct({ name: i.productName }))) throw new CardPurchaseError("Карта уже добавлена в этот заказ.", 409);
  const campaign = await getCampaign();
  const products = await prisma.product.findMany({ where: { id: { in: order.items.map(i => i.productId) } }, select: { id: true, guid: true, prices: { select: { priceType: true, price: true } } } });
  const byId = new Map(products.map(p => [p.id, p]));
  const lines = order.items.map(i => {
    const product = byId.get(i.productId);
    if (!product) throw new CardPurchaseError(`Не удалось найти актуальную цену товара «${i.productName}». Заказ не изменён.`, 409);
    const price = Math.round(priceFor(withFlatPrices(product, campaign), "discount", Date.now(), campaign));
    if (!Number.isFinite(price) || price <= 0) throw new CardPurchaseError(`Не найдена цена товара «${i.productName}». Заказ не изменён.`, 409);
    return { sku: product.guid || String(i.productId), productName: i.productName, price, quantity: i.quantity, total: price * i.quantity };
  });
  let calc: LoyaltyResult | null = null;
  if (lines.length && (order.promoCode || customer.loyaltyCard || order.bonusesApplied > 0)) {
    if (!maxmaConfigured()) throw new CardPurchaseError("MAXMA недоступна. Нельзя точно пересчитать скидки и бонусы. Заказ не изменён.", 503);
    try { calc = await calcLoyalty({ customer, lines, promocode: order.promoCode, applyBonuses: order.bonusesApplied }); }
    catch { throw new CardPurchaseError("MAXMA не ответила. Карта не добавлена, заказ не изменён. Повторите попытку.", 502); }
  }
  const promoApplied = !!order.promoCode && !!calc?.promo?.applied && (calc.promo.discount ?? 0) > 0;
  const discounts = lines.map((_, i) => promoApplied ? calc?.promo?.lines[i] ?? 0 : 0);
  const bonusLines = lines.map((_, i) => calc?.bonusLines[i] ?? 0);
  const applied = bonusLines.reduce((s, n) => s + n, 0);
  const collected = calc?.bonuses?.collected ?? 0;
  const discount = discounts.reduce((s, n) => s + n, 0);
  const total = CARD_PRICE + lines.reduce((s, l) => s + l.total, 0) - discount - applied;
  if (!Number.isSafeInteger(total) || total < CARD_PRICE) throw new CardPurchaseError("Не удалось проверить итог заказа. Заказ не изменён.", 409);
  const comment = [order.comment, cardOrderComment(registration, phone)].filter(Boolean).join("\n");
  await prisma.$transaction(async tx => {
    // Lock the account too: a parallel admin/card-owner change must invalidate this calculation.
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customer.id} FOR UPDATE`;
    const fresh = await tx.customer.findUnique({ where: { id: customer.id }, select: { phone: true, priceType: true, loyaltyCard: true, maxmaDiscount: true } });
    if (!fresh || fresh.phone !== customer.phone || fresh.priceType !== customer.priceType || fresh.loyaltyCard !== customer.loyaltyCard || fresh.maxmaDiscount !== customer.maxmaDiscount) throw new CardPurchaseError("Данные клиента изменились. Обновите заказ и повторите.", 409);
    const result = await tx.order.updateMany({ where: { id: orderId, status: "assembly", updatedAt: order.updatedAt, oneCExportedAt: null, oneCSendingAt: null }, data: { total, discount, bonusesApplied: applied, bonusesCollected: collected, promoCode: promoApplied ? order.promoCode : null, priceTier: "discount", customerConfirmed: false, comment } });
    if (!result.count) throw new CardPurchaseError("Заказ изменился. Обновите его и повторите действие.", 409);
    for (let i = 0; i < order.items.length; i++) await tx.orderItem.update({ where: { id: order.items[i].id }, data: { price: lines[i].price, total: lines[i].total, discount: discounts[i], bonusDiscount: bonusLines[i] } });
    await tx.orderItem.create({ data: { orderId, productId: cardProduct.id, productName: CARD_PRODUCT_NAME, quantity: 1, price: CARD_PRICE, total: CARD_PRICE } });
    await tx.customer.update({ where: { id: customer.id }, data: { loyaltyAutoLinkDisabled: false } });
    // Store the external sync task with the prices, so no committed change loses its MAXMA update.
    if (maxmaConfigured() && (promoApplied || applied > 0 || collected > 0)) await tx.maxmaTask.create({ data: { orderId, action: "set", payload: setOrderQuery(lines, { customer, promocode: promoApplied ? order.promoCode : null, applyBonuses: applied }) as unknown as Prisma.InputJsonValue } });
    else if (maxmaConfigured() && (order.promoCode || order.bonusesApplied > 0 || order.bonusesCollected > 0)) await tx.maxmaTask.create({ data: { orderId, action: "cancel" } });
    await tx.adminAuditLog.create({ data: { userId: staff.id, userName: staff.login, action: "order.card-purchase", entity: "order", entityId: String(orderId), summary: "Добавлена покупка карты «Косметичка» и пересчитан заказ", before: { total: order.total, priceTier: order.priceTier }, after: { total, priceTier: "discount", cardPrice: CARD_PRICE } } });
    await tx.orderMessage.create({ data: { orderId, source: "customer", userId: staff.id, isFromPicker: true, text: `Добавлена карта «Косметичка» за ${CARD_PRICE} ₽. Товары пересчитаны по скидочным ценам. Было: ${order.total} ₽. Стало с картой: ${total} ₽.` } });
  }, { timeout: 10000 });
  try {
    const after = await prisma.orderItem.findMany({ where: { orderId } });
    await logOrderChanges(orderId, "staff", staff.login, order.items, after);
  } catch { console.warn("[assembly-card] Could not append line change history; purchase is committed"); }
  void runOrderMaxmaTasks(orderId).catch(() => {});
  return { ok: true, previousTotal: order.total, total, cardPrice: CARD_PRICE, ...(order.promoCode && !promoApplied ? { warning: "Промокод больше не подходит к пересчитанному заказу и снят." } : {}) };
}
