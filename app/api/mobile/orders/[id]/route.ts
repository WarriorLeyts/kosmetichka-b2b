import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../_auth";
import { orderChanges } from "@/lib/orderChanges";
import { SHOP_ADDRESS, SHOP_MAP_URL } from "@/lib/delivery";
import { CUSTOMER_EDITABLE_STATUSES, customerEditBlockedReason } from "@/lib/orderStatus";

// GET /api/mobile/orders/:id — one order of the logged-in customer
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!order || order.customerId !== customerId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  // photos of the lines, and who changed what (the customer is shown the manager's changes)
  const [images, changes] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId: { in: [...new Set(order.items.map((i) => i.productId))] } },
      select: { productId: true, path: true },
      orderBy: { id: "asc" },
    }),
    orderChanges(order.id, order.items),
  ]);
  const imageOf = new Map<number, string>();
  for (const im of images) if (!imageOf.has(im.productId)) imageOf.set(im.productId, im.path);

  return NextResponse.json({
    id: order.id,
    customerConfirmed: order.customerConfirmed,
    /** the customer may still change the order (quantities, remove, add) */
    editable: CUSTOMER_EDITABLE_STATUSES.includes(order.status),
    /** why not (shown instead of «Изменить»), for an active order */
    editBlockedReason: customerEditBlockedReason(order.status),
    /** the manager changed the order and waits for «Подтвердить» (until then it can't be «Заказ оформлен») */
    needsConfirm: !!order.confirmRequestedAt || (order.status === "consultation" && !order.customerConfirmed),
    confirmRequestedAt: order.confirmRequestedAt ? order.confirmRequestedAt.toISOString() : null,
    status: order.status,
    total: order.total,
    promoCode: order.promoCode ?? null,
    discount: order.discount,
    bonusesApplied: order.bonusesApplied,
    bonusesCollected: order.bonusesCollected,
    comment: order.comment,
    /** «pickup» — Заберу в магазине (shopAddress), «delivery» — to deliveryAddress; null — old orders */
    deliveryType: order.deliveryType ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    shopAddress: SHOP_ADDRESS,
    shopMapUrl: SHOP_MAP_URL,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      variantName: item.variantName,
      barcode: item.barcode,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      discount: item.discount,
      bonusDiscount: item.bonusDiscount,
      variantImageUrl: item.variantImageUrl,
      imagePath: imageOf.get(item.productId) ?? null,
      /** what the manager did to this line: added it / changed it (and what it was) */
      staffChange: changes.lines[item.id]?.staff ?? null,
    })),
    /** lines taken out of the order — by the manager or by the customer */
    removedItems: changes.removed.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      variantName: r.variantName,
      quantity: r.quantity,
      price: r.price,
      imagePath: r.imageUrl,
      by: r.side,
      at: r.at,
    })),
  });
}
