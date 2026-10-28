import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { prisma } from "@/lib/prisma";
import { orderSums, priceOrderItems, type PricedLine } from "@/lib/orderPricing";
import { minOrderFor } from "@/lib/pricing";
import { isMaxmaOrder, loyaltyResponse, recalcOrderLoyalty } from "@/lib/maxmaOrders";
import { logOrderChanges, summarizeRows } from "@/lib/orderChanges";
import { CUSTOMER_EDITABLE_STATUSES, customerEditBlockedReason } from "@/lib/orderStatus";

/**
 * Customer edits their order (app / site): change quantities, remove lines, add products.
 * Prices of added products are the customer's own prices (same rules as when ordering); prices of
 * existing lines stay as they are (only staff change prices). Every change is logged for staff
 * (OrderItemChange) and summarised in the order chat, so the manager and the picker see it.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const payload = await verifyCustomerToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const [order, customer] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, include: { items: true } }),
    prisma.customer.findUnique({ where: { id: Number(payload.id) } }),
  ]);
  if (!order || !customer) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (order.customerId !== customer.id) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (!CUSTOMER_EDITABLE_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: customerEditBlockedReason(order.status) }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    items?: { id: number; quantity: number }[];
    removeIds?: number[];
    newItems?: { id: number; quantity: number; variantName?: string | null; variantImageUrl?: string | null }[];
  };
  const updates = Array.isArray(body.items) ? body.items : [];
  const removeIds = (Array.isArray(body.removeIds) ? body.removeIds : []).map(Number);
  const added = Array.isArray(body.newItems) ? body.newItems : [];
  if (updates.length + removeIds.length + added.length > 500) {
    return NextResponse.json({ error: "Слишком много изменений сразу" }, { status: 400 });
  }

  const byId = new Map(order.items.map((i) => [i.id, i]));
  for (const u of updates) {
    if (!byId.has(Number(u.id))) return NextResponse.json({ error: `Позиция ${u.id} не принадлежит этому заказу` }, { status: 400 });
    const q = Number(u.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 100000) return NextResponse.json({ error: "Количество должно быть не менее 1" }, { status: 400 });
  }
  for (const rid of removeIds) {
    if (!byId.has(rid)) return NextResponse.json({ error: `Позиция ${rid} не принадлежит этому заказу` }, { status: 400 });
  }

  // added products: the customer's prices, minimum quantities — as when ordering
  let priced: PricedLine[] = [];
  if (added.length > 0) {
    try {
      priced = await priceOrderItems(
        customer,
        added.map((a) => ({ id: Number(a.id), quantity: Number(a.quantity), variantName: a.variantName ?? null, variantImageUrl: a.variantImageUrl ?? null }))
      );
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось добавить товар" }, { status: 400 });
    }
  }

  // the order after the edit (to check it before writing anything)
  const removeSet = new Set(removeIds);
  const qtyOf = new Map(updates.map((u) => [Number(u.id), Number(u.quantity)]));
  const kept = order.items.filter((i) => !removeSet.has(i.id)).map((i) => ({ ...i, quantity: qtyOf.get(i.id) ?? i.quantity }));
  // a product that is already in the order (same variant) gets more pieces instead of a second line
  const extraQty = new Map<number, number>();
  const newLines: PricedLine[] = [];
  for (const line of priced) {
    const same = kept.find((k) => k.productId === line.productId && (k.variantName ?? null) === (line.variantName ?? null));
    if (same) extraQty.set(same.id, (extraQty.get(same.id) ?? 0) + line.quantity);
    else newLines.push(line);
  }
  for (const k of kept) if (extraQty.has(k.id)) k.quantity += extraQty.get(k.id)!;

  if (kept.length + newLines.length === 0) {
    return NextResponse.json({ error: "В заказе должна остаться хотя бы одна позиция. Чтобы отказаться от заказа, отмените его." }, { status: 400 });
  }
  const sumBefore = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const sumAfter = kept.reduce((s, i) => s + i.price * i.quantity, 0) + newLines.reduce((s, l) => s + l.total, 0);
  const minOrder = minOrderFor(customer);
  if (minOrder > 0 && sumAfter < minOrder && sumAfter < sumBefore) {
    return NextResponse.json(
      { error: `Минимальная сумма заказа — ${minOrder.toLocaleString("ru-RU")} ₽. После изменений получится ${sumAfter.toLocaleString("ru-RU")} ₽.`, code: "min_order" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    if (removeIds.length > 0) {
      await tx.orderItemCheck.deleteMany({ where: { orderItemId: { in: removeIds } } });
      await tx.orderItemPhoto.deleteMany({ where: { orderItemId: { in: removeIds } } });
      await tx.orderItem.deleteMany({ where: { id: { in: removeIds }, orderId } });
    }
    for (const k of kept) {
      const orig = byId.get(k.id)!;
      if (k.quantity === orig.quantity) continue;
      await tx.orderItem.update({ where: { id: k.id }, data: { quantity: k.quantity, total: Math.round(k.price * k.quantity) } });
    }
    for (const l of newLines) {
      await tx.orderItem.create({
        data: {
          orderId,
          productId: l.productId,
          productName: l.productName,
          barcode: l.barcode,
          quantity: l.quantity,
          price: l.price,
          total: l.total,
          variantName: l.variantName ?? null,
          variantImageUrl: l.variantImageUrl ?? null,
        },
      });
    }
    // Without a promo code / bonuses the total is Σ lines; with them recalcOrderLoyalty below does it
    if (!isMaxmaOrder(order)) {
      const remaining = await tx.orderItem.findMany({ where: { orderId } });
      await tx.order.update({ where: { id: orderId }, data: { total: orderSums(remaining).total } });
    }
  });

  const after = await prisma.orderItem.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  const rows = await logOrderChanges(orderId, "customer", null, order.items, after);
  // the customer saw the manager's changes and answered with his own: no separate confirmation needed
  if (rows.length > 0 && order.confirmRequestedAt) {
    await prisma.order.update({ where: { id: orderId }, data: { confirmRequestedAt: null, customerConfirmed: true } }).catch(() => {});
  }
  if (rows.length > 0) {
    // staff see it at once: in the order chat (admin site, Team app, Bitrix) as a message from the customer
    await prisma.orderMessage
      .create({ data: { orderId, source: "customer", text: `🛒 Клиент изменил заказ:\n${summarizeRows(rows, 12)}` } })
      .catch((e) => console.error("[order-changes] chat:", e instanceof Error ? e.message : e));
  }

  // Promo code / bonuses: MAXMA recalculates them for the new items
  const loyalty = isMaxmaOrder(order) ? await recalcOrderLoyalty(orderId) : null;

  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          productName: true,
          barcode: true,
          quantity: true,
          price: true,
          total: true,
          discount: true,
          bonusDiscount: true,
          variantImageUrl: true,
          variantName: true,
        },
      },
    },
  });

  if (!loyalty) return NextResponse.json({ order: updatedOrder });
  return NextResponse.json({ order: updatedOrder, ...loyaltyResponse(loyalty) });
}
