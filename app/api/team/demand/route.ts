import { NextResponse } from "next/server";
import { ADMIN_ONLY, requireStaff } from "../_auth";
import { prisma } from "@/lib/prisma";
import { demandId, demandSameOrigin } from "@/lib/customerDemand";
import { recordRestock } from "@/scripts/record-restock.js";
import { availableForSubscriber } from "@/scripts/restock-availability.js";
import { sendPush } from "@/lib/notify";
import { sendWebPushToCustomers } from "@/lib/webPush";

const customerSelect = { id: true, name: true, companyName: true, phone: true, priceType: true } as const;
export async function GET(request: Request) {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(sp.get("page")) || 1)));
  const kind = sp.get("kind") === "missing" ? "missing" : sp.get("kind") === "notified" ? "notified" : "waiting";
  const take = 20;
  if (kind === "missing") {
    const where = { closed: false, linkedProductId: null };
    const groups = await prisma.productWish.groupBy({ by: ["nameKey"], where, _sum: { quantity: true }, _count: { _all: true }, _max: { updatedAt: true }, orderBy: { _max: { updatedAt: "desc" } }, skip: (page - 1) * take, take: take + 1 });
    const items = await Promise.all(groups.slice(0, take).map(async g => {
      const requests = await prisma.productWish.findMany({ where: { ...where, nameKey: g.nameKey }, take: 200, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, quantity: true, comment: true, photoName: true, updatedAt: true, customer: { select: customerSelect } } });
      return { key: g.nameKey, name: requests[0]?.name ?? g.nameKey, quantity: g._sum.quantity ?? 0, customers: g._count._all, requests, moreRequests: g._count._all > requests.length };
    }));
    return NextResponse.json({ kind, items, page, hasMore: groups.length > take }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const where = { notified: kind === "notified" };
  const groups = await prisma.wishlistItem.groupBy({ by: ["productId"], where, _sum: { quantity: true }, _count: { _all: true, quantity: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, skip: (page - 1) * take, take: take + 1 });
  const items = await Promise.all(groups.slice(0, take).map(async g => {
    const [product, requests] = await Promise.all([
      prisma.product.findUnique({ where: { id: g.productId }, select: { id: true, name: true, stock: true, wholesaleStock: true, images: { take: 1, select: { path: true } } } }),
      prisma.wishlistItem.findMany({ where: { ...where, productId: g.productId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, quantity: true, notifiedAt: true, createdAt: true, customer: { select: customerSelect } } }),
    ]);
    return { key: String(g.productId), product, name: product?.name ?? "Удалённый товар", quantity: g._sum.quantity ?? 0, customers: g._count._all, unknownQuantity: g._count._all - g._count.quantity, requests, moreRequests: g._count._all > requests.length };
  }));
  return NextResponse.json({ kind, items, page, hasMore: groups.length > take }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Linking is explicit: matching by similar names must never subscribe customers to the wrong product. */
export async function POST(request: Request) {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;
  if (!demandSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник" }, { status: 403 });
  const b = (await request.json().catch(() => null)) ?? {};
  const id = demandId(b.wishId), productId = demandId(b.productId);
  if (!id || !productId) return NextResponse.json({ error: "Укажите запрос и ID товара" }, { status: 400 });
  const wish = await prisma.productWish.findUnique({ where: { id }, include: { customer: { select: { id: true, isActive: true, priceType: true } } } });
  const product = await prisma.product.findFirst({ where: { id: productId, hidden: false }, select: { id: true, name: true, stock: true, wholesaleStock: true } });
  if (!wish || !product) return NextResponse.json({ error: "Запрос или товар не найден" }, { status: 404 });
  if (wish.linkedProductId) return NextResponse.json({ error: "Этот запрос уже связан с товаром. Обновите список." }, { status: 409 });
  const item = await prisma.$transaction(async tx => {
    const locked = await tx.productWish.updateMany({ where: { id, linkedProductId: null, closed: false }, data: { linkedProductId: productId } });
    if (!locked.count) return null;
    const key = { customerId: wish.customerId, productId };
    const existing = await tx.wishlistItem.findUnique({ where: { customerId_productId: key } });
    return tx.wishlistItem.upsert({ where: { customerId_productId: key }, create: { ...key, quantity: wish.quantity }, update: { quantity: Math.max(existing?.quantity ?? 0, wish.quantity) } });
  });
  if (!item) return NextResponse.json({ error: "Запрос уже изменён. Обновите список." }, { status: 409 });
  if (availableForSubscriber(wish.customer, product) && await recordRestock(prisma, { ...item, customer: wish.customer, product })) {
    const title = "Товар из вашего пожелания в наличии";
    const body = `${product.name.slice(0, 220)}. Проверьте количество и цену. Это не бронь: товар не резервируется.`;
    const link = `/product/${product.id}`;
    const tokens = await prisma.pushToken.findMany({ where: { customerId: wish.customerId }, select: { token: true } });
    await Promise.allSettled([
      sendPush(tokens.map(t => ({ to: t.token, title, body, data: { link, kind: "restock" }, sound: "default", channelId: "default", priority: "high" }))),
      sendWebPushToCustomers([wish.customerId], { title, body, link, kind: "restock" }, "high"),
    ]);
  }
  return NextResponse.json({ ok: true, product: { id: product.id, name: product.name } });
}
