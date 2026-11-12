import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { orderVisible, staffScope } from "@/lib/staffScope";
import { CLAIM_STALE_MS, READY_STATUSES, SYNC_LABELS, syncState } from "@/lib/cms/orderSync";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { ordersViaOData, sendOrderTo1C } from "@/lib/onecOrders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cms/orders/<id>/retry — «Повторить отправку»: the same sendOrderTo1C the worker runs
 * (it looks the document up in 1С first, so a retry never makes a second one), right now.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await cmsGuard(request, "orders.retry");
  if (isGuardError(g)) return g;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0 || !(await orderVisible(await staffScope(g.user), id))) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if (!ordersViaOData()) return NextResponse.json({ error: "Отправка заказов в 1С по OData выключена на сервере" }, { status: 503 });
  const before = await prisma.order.findUnique({ where: { id }, select: { status: true, oneCExportedAt: true, oneCError: true, oneCSendingAt: true } });
  if (!before) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const state = syncState(before);
  if (state === "synced") return NextResponse.json({ error: "Заказ уже передан в 1С" }, { status: 409 });
  if (!READY_STATUSES.includes(before.status)) {
    return NextResponse.json(
      { error: `Заказ в статусе «${ORDER_STATUS_LABELS[before.status] ?? before.status}» — в 1С он уходит после «Заказ оформлен»` },
      { status: 409 }
    );
  }
  if (state === "sending") {
    // a send is running (or 1С didn't answer and the document may exist): a second sender could make a copy
    const left = Math.max(1, Math.ceil((CLAIM_STALE_MS - (Date.now() - new Date(before.oneCSendingAt!).getTime())) / 60_000));
    return NextResponse.json({ error: `Заказ сейчас отправляется (или 1С не ответила). Повторить можно через ${left} мин.` }, { status: 409 });
  }

  const outcome = await sendOrderTo1C(id, { trigger: "manual", by: g.user.name || g.user.login });
  const after = await prisma.order.findUnique({
    where: { id },
    select: { status: true, oneCExportedAt: true, oneCError: true, oneCSendingAt: true, oneCNumber: true, oneCStockNumber: true },
  });
  const now = after ? syncState(after) : state;
  await logAction(g.user, g.ip, {
    action: "order.retry1c",
    entity: "order",
    entityId: id,
    summary: `Заказ №${id}: повтор отправки в 1С — ${SYNC_LABELS[now]}${after?.oneCNumber ? ` (${[after.oneCNumber, after.oneCStockNumber].filter(Boolean).join(", ")})` : ""}`,
    before: { error: before.oneCError },
    after: { outcome, error: after?.oneCError ?? null },
  });
  return NextResponse.json({ outcome, sync: now, error: now === "synced" ? null : (after?.oneCError ?? null), oneCNumber: after?.oneCNumber ?? null });
}
