import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { orderVisible, staffScope } from "@/lib/staffScope";
import { syncState } from "@/lib/cms/orderSync";
import { ordersViaOData } from "@/lib/onecOrders";

export const dynamic = "force-dynamic";

// GET /api/cms/orders/<id> — заказ: покупатель, строки, документы 1С и журнал всех попыток передачи
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await cmsGuard(request, "orders.view");
  if (isGuardError(g)) return g;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || !(await orderVisible(await staffScope(g.user), id))) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  const o = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      total: true,
      discount: true,
      bonusesApplied: true,
      promoCode: true,
      priceType: true,
      priceTier: true,
      deliveryType: true,
      deliveryAddress: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
      oneCExportedAt: true,
      oneCRef: true,
      oneCNumber: true,
      oneCStockRef: true,
      oneCStockNumber: true,
      oneCError: true,
      oneCNextTryAt: true,
      oneCSendingAt: true,
      customer: { select: { id: true, name: true, companyName: true, phone: true, oneCId: true, manager: true, priceType: true } },
      items: { orderBy: { id: "asc" }, select: { id: true, productId: true, productName: true, barcode: true, quantity: true, price: true, total: true, discount: true, bonusDiscount: true } },
      oneCAttempts: { orderBy: { at: "desc" }, take: 200 },
      statusLogs: { orderBy: { createdAt: "desc" }, take: 30, select: { fromStatus: true, toStatus: true, createdAt: true, user: { select: { name: true } } } },
    },
  });
  if (!o) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const { oneCAttempts, statusLogs, ...order } = o;
  return NextResponse.json({
    order: { ...order, sync: syncState(o) },
    attempts: oneCAttempts,
    statusLog: statusLogs.map((s) => ({ from: s.fromStatus, to: s.toStatus, at: s.createdAt, by: s.user?.name ?? null })),
    odata: ordersViaOData(),
  });
}
