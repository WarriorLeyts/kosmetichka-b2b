import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCheckStatuses } from "@/lib/checkStatus";
import {
  ORDER_STATUS_ACTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
} from "@/lib/orderStatus";
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
  const [productImageRows, productRows] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, path: true },
      orderBy: { id: "asc" },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, barcode: true },
    }),
  ]);
  const productImages = new Map<number, string>();
  for (const img of productImageRows) {
    if (!productImages.has(img.productId)) productImages.set(img.productId, img.path);
  }
  const productBarcodes = new Map<number, string | null>();
  for (const p of productRows) productBarcodes.set(p.id, p.barcode ?? null);

  const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
  const actions = (ORDER_STATUS_ACTIONS[order.status] ?? []).map((a) => ({
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
      comment: order.comment ?? null,
      customerConfirmed: order.customerConfirmed,
      changesSnapshot: order.changesSnapshot ?? null,
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
        priceType: order.customer.priceType,
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
          variantName: item.variantName ?? null,
          variantImageUrl: item.variantImageUrl ?? null,
          imagePath,
          imageUrl: productImageUrl(imagePath),
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
    canEditItems: ["pending", "consultation", "assembly"].includes(order.status),
    statusLabels: ORDER_STATUS_LABELS,
    customerMessagesUrl: `/api/admin/orders/${order.id}/customer-messages`,
  });
}
