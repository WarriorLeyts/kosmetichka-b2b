import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { orderChanges } from "@/lib/orderChanges";
import { parseCheckStatuses } from "@/lib/checkStatus";
import { ANY_STAFF, requireStaff } from "../../../_auth";
import { badId, notFound, parseId, productImageUrl } from "../../../_shared";

// GET /api/team/picker/orders/:id — what app/picker/[orderId]/page.tsx passes to PickerOrderClient
// The page only works for orders in "assembly"; otherwise → 409 { error, status }.
// Picker chat: GET/POST /api/picker/messages/:id (not duplicated here).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const orderId = parseId(id);
  if (!orderId) return badId();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      comment: true,
      total: true,
      pickerId: true,
      createdAt: true,
      picker: { select: { id: true, name: true } },
      customer: { select: { companyName: true, name: true, phone: true } },
      items: {
        include: {
          check: true,
          photos: { orderBy: { id: "asc" } },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) return notFound();

  if (order.status !== "assembly") {
    return NextResponse.json(
      { error: "Этот заказ не на стадии сборки", status: order.status },
      { status: 409 }
    );
  }

  // First product image and catalog barcode by productId (same as the page)
  const products = await prisma.product.findMany({
    where: { id: { in: order.items.map((i) => i.productId) } },
    select: {
      id: true,
      barcode: true,
      images: { take: 1, select: { path: true } },
    },
  });
  const imageMap = new Map<number, string | null>();
  const barcodeMap = new Map<number, string | null>();
  for (const p of products) {
    imageMap.set(p.id, productImageUrl(p.images[0]?.path ?? null));
    barcodeMap.set(p.id, p.barcode ?? null);
  }

  // what the customer / staff changed (the picker must see it: added, changed, removed lines)
  const changes = await orderChanges(order.id, order.items);

  return NextResponse.json({
    currentUserId: auth.session.id,
    order: {
      id: order.id,
      status: order.status,
      comment: order.comment ?? null,
      total: order.total,
      createdAt: order.createdAt.toISOString(),
      pickerId: order.pickerId ?? null,
      picker: order.picker ?? null,
      customer: order.customer,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode ?? barcodeMap.get(item.productId) ?? null,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        variantName: item.variantName ?? null,
        variantImageUrl: item.variantImageUrl ?? null,
        imageUrl: imageMap.get(item.productId) ?? null,
        customerChange: changes.lines[item.id]?.customer ?? null,
        staffChange: changes.lines[item.id]?.staff ?? null,
        check: item.check
          ? {
              status: item.check.status,
              statuses: parseCheckStatuses(item.check.status),
              availableQty: item.check.availableQty ?? null,
              note: item.check.note ?? null,
              pickerId: item.check.pickerId ?? null,
              checkedAt: item.check.checkedAt.toISOString(),
            }
          : null,
        photos: item.photos.map((p) => ({
          id: p.id,
          url: p.url,
          createdAt: p.createdAt.toISOString(),
        })),
      })),
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
    },
  });
}
