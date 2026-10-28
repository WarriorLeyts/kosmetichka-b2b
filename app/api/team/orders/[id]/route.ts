import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderChanges } from "@/lib/orderChanges";
import { paymentBlocked } from "@/lib/orderConfirm";
import { parseCheckStatuses } from "@/lib/checkStatus";
import {
  ORDER_STATUS_ACTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
} from "@/lib/orderStatus";
import { maxmaActionLabel, maxmaStuckByOrder } from "@/lib/maxmaQueue";
import { ADMIN_MANAGER, requireStaff } from "../../_auth";
import { badId, notFound, parseId, productImageUrl } from "../../_shared";

// GET /api/team/orders/:id — everything app/admin/orders/[id]/page.tsx passes to AdminOrderClient
// (customer chat is NOT included: use GET /api/admin/orders/:id/customer-messages)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const orderId = parseId(id);
  if (!orderId) return badId();

  const [order, pickers] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true,
            name: true,
            phone: true,
            email: true,
            city: true,
            inn: true,
            manager: true,
            priceType: true,
          },
        },
        picker: { select: { id: true, name: true } },
        items: {
          include: {
            check: {
              include: { picker: { select: { name: true } } },
            },
            photos: { orderBy: { id: "asc" } },
          },
          orderBy: { id: "asc" },
        },
        messages: {
          where: { source: "picker" },
          include: { user: { select: { name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
        statusLogs: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // Staff available for assignment (POST /api/admin/orders/:id/assign accepts only role=picker)
    prisma.user.findMany({
      where: { role: "picker" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!order) return notFound();

  // First product image (by image id) and catalog barcode for each item
  const productIds = order.items.map((i) => i.productId);
  const [productImageRows, productRows, maxmaStuckMap] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, path: true },
      orderBy: { id: "asc" },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, barcode: true, stock: true },
    }),
    maxmaStuckByOrder([order.id]),
  ]);
  const maxmaStuck = maxmaStuckMap.get(order.id) ?? null;
  const productImages = new Map<number, string>();
  for (const img of productImageRows) {
    if (!productImages.has(img.productId)) productImages.set(img.productId, img.path);
  }
  const productBarcodes = new Map<number, string | null>();
  const productStock = new Map<number, number | null>();
  for (const p of productRows) {
    productBarcodes.set(p.id, p.barcode ?? null);
    productStock.set(p.id, p.stock ?? null);
  }

  // who changed which line (customer / staff) and what was removed
  const changes = await orderChanges(order.id, order.items);

  // «Заказ оформлен» waits for the customer's confirmation of the order — the button is not offered
  const awaiting = paymentBlocked(order);
  const allowedTransitions = (ORDER_STATUS_TRANSITIONS[order.status] ?? []).filter((t) => !(awaiting && t === "payment"));
  const actions = (ORDER_STATUS_ACTIONS[order.status] ?? [])
    .filter((a) => !(awaiting && a.to === "payment"))
    .map((a) => ({
      label: a.label,
      to: a.to,
    }));

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
      total: order.total,
      promoCode: order.promoCode ?? null,
      discount: order.discount,
      bonusesApplied: order.bonusesApplied,
      bonusesCollected: order.bonusesCollected,
      // Promo code / bonuses not synced with MAXMA for over an hour (retry: POST /api/admin/maxma/retry)
      maxmaStuck: Boolean(maxmaStuck),
      ...(maxmaStuck
        ? {
            maxmaError: `${maxmaActionLabel(maxmaStuck.action)}, попыток ${maxmaStuck.attempts}${
              maxmaStuck.lastError ? `, ошибка: ${maxmaStuck.lastError}` : ""
            }`,
          }
        : {}),
      comment: order.comment ?? null,
      customerConfirmed: order.customerConfirmed,
      changesSnapshot: order.changesSnapshot ?? null,
      /** staff changed the order; waiting for the customer's «Подтвердить» since then — «Заказ оформлен» is blocked */
      awaitingConfirmationSince: order.confirmRequestedAt ? order.confirmRequestedAt.toISOString() : null,
      confirmReminders: order.confirmReminders,
      oneCExportedAt: order.oneCExportedAt ? order.oneCExportedAt.toISOString() : null,
      bitrixDealId: order.bitrixDealId ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customerId: order.customerId,
      customer: {
        id: order.customer.id,
        companyName: order.customer.companyName,
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email,
        city: order.customer.city ?? null,
        inn: order.customer.inn ?? null,
        manager: order.customer.manager ?? null,
        // price type of this order (the customer may have switched since)
        priceType: order.priceType ?? order.customer.priceType,
      },
      pickerId: order.pickerId ?? null,
      picker: order.picker ?? null,
      items: order.items.map((item) => {
        const imagePath = productImages.get(item.productId) ?? null;
        return {
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode ?? productBarcodes.get(item.productId) ?? null,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          discount: item.discount,
          bonusDiscount: item.bonusDiscount,
          variantName: item.variantName ?? null,
          variantImageUrl: item.variantImageUrl ?? null,
          imagePath,
          imageUrl: productImageUrl(imagePath),
          /** current stock in the shop */
          stock: productStock.get(item.productId) ?? null,
          /** what the customer / staff did to this line: { kind: "added"|"changed", oldQuantity, oldPrice, oldVariant, actorName, at } */
          customerChange: changes.lines[item.id]?.customer ?? null,
          staffChange: changes.lines[item.id]?.staff ?? null,
          check: item.check
            ? {
                status: item.check.status,
                statuses: parseCheckStatuses(item.check.status),
                hasIssues: parseCheckStatuses(item.check.status).some((s) => s !== "ok"),
                note: item.check.note ?? null,
                availableQty: item.check.availableQty ?? null,
                picker: item.check.picker ?? null,
                updatedAt: item.check.checkedAt.toISOString(),
              }
            : null,
          photos: item.photos.map((p) => ({
            id: p.id,
            url: p.url,
            createdAt: p.createdAt.toISOString(),
          })),
        };
      }),
      /** lines taken out of the order: by the customer ("customer") or staff ("staff", actorName) */
      removedItems: changes.removed.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        variantName: r.variantName,
        barcode: r.barcode,
        quantity: r.quantity,
        price: r.price,
        imagePath: r.imageUrl,
        by: r.side,
        actorName: r.actorName,
        at: r.at,
      })),
      // picker↔manager chat (same shape as GET /api/picker/messages/:orderId, plus userRole)
      messages: order.messages.map((m) => ({
        id: m.id,
        text: m.text,
        isFromPicker: m.isFromPicker,
        userId: m.userId,
        userName: m.user?.name ?? null,
        userRole: m.user?.role ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      statusLogs: order.statusLogs.map((l) => ({
        id: l.id,
        fromStatus: l.fromStatus ?? null,
        toStatus: l.toStatus,
        userId: l.userId ?? null,
        userName: l.user?.name ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    },
    pickers,
    allowedTransitions,
    actions,
    // Items can be edited (PUT /api/admin/orders/:id/items) only in these statuses
    canEditItems: order.status === "assembly",
    statusLabels: ORDER_STATUS_LABELS,
    customerMessagesUrl: `/api/admin/orders/${order.id}/customer-messages`,
  });
}
