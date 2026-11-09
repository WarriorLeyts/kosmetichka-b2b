import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../../../../../../_auth";
import { badId, notFound, parseId } from "../../../../../../_shared";
import { staffSeesOrder } from "@/lib/staffScope";
import { splitsWarehouses, toWarehouseQty } from "@/lib/orderWarehouses";

// PUT /api/team/picker/orders/:id/items/:itemId/warehouse { stock: n } — wholesale assembly: n pieces of the
// line come from «0. Склад», the rest from «1. Мега Косметичка». { stock: null } — back to the 12-piece rule.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const { id, itemId } = await params;
  const orderId = parseId(id);
  const lineId = parseId(itemId);
  if (!orderId || !lineId) return badId();
  if (!(await staffSeesOrder(auth.session, orderId))) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const item = await prisma.orderItem.findFirst({
    where: { id: lineId, orderId },
    select: { id: true, quantity: true, order: { select: { status: true, oneCExportedAt: true, customer: { select: { priceType: true } } } } },
  });
  if (!item) return notFound();
  if (!splitsWarehouses(item.order.customer?.priceType)) return NextResponse.json({ error: "Склад выбирается только в оптовых заказах" }, { status: 400 });
  if (item.order.oneCExportedAt || !["pending", "approved", "assembly", "consultation", "payment"].includes(item.order.status)) {
    return NextResponse.json({ error: "Заказ уже ушёл в 1С — склад не поменять" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const raw = body?.stock;
  if (raw === null) {
    await prisma.orderItem.update({ where: { id: lineId }, data: { warehouseQty: Prisma.DbNull } });
    return NextResponse.json({ ok: true });
  }
  const stock = Number(raw);
  if (!Number.isInteger(stock) || stock < 0 || stock > item.quantity) {
    return NextResponse.json({ error: `Со склада можно взять от 0 до ${item.quantity} шт.` }, { status: 400 });
  }
  await prisma.orderItem.update({ where: { id: lineId }, data: { warehouseQty: toWarehouseQty({ stock, shop: item.quantity - stock }) } });
  return NextResponse.json({ ok: true, stock, shop: item.quantity - stock });
}
