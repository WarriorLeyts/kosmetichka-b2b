import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockedByOrderId } from "@/lib/orderLock";
import { staffSeesOrder } from "@/lib/staffScope";
import { canHoldForContact, contactResumeStatus } from "@/lib/orderContact";
import { kickOrderTo1C } from "@/lib/onecOrders";

async function changeContact(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный номер заказа" }, { status: 400 });
  if (!(await staffSeesOrder(user, id))) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || !["hold", "resume"].includes(body.action)) return NextResponse.json({ error: "Выберите перенос или возврат заказа" }, { status: 400 });
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const hold = body.action === "hold";
  if (hold && order.status === "no_contact") return NextResponse.json({ order });
  if (hold && !canHoldForContact(order)) return NextResponse.json({
    error: "Перенести можно заказ в работе, который ещё не передаётся в 1С и не выгружен. Обновите карточку заказа.",
  }, { status: 409 });
  if (!hold && order.status !== "no_contact") return NextResponse.json({ error: "Заказ уже не находится в разделе «Нет связи». Обновите карточку." }, { status: 409 });

  let target = "no_contact";
  if (!hold) {
    const previous = await prisma.orderStatusLog.findFirst({ where: { orderId: id, toStatus: "no_contact" }, orderBy: { id: "desc" } });
    const restored = contactResumeStatus(previous ? [previous] : []);
    if (!restored) return NextResponse.json({ error: "В истории нет этапа, на который можно вернуть заказ." }, { status: 409 });
    target = restored;
  }
  try {
    // The conditional update races safely with the 1C export claim. The history is one atomic nested write.
    const updated = await prisma.order.update({
      where: { id, status: order.status, ...(hold ? { oneCSendingAt: null, oneCExportedAt: null, oneCRef: null, oneCStockRef: null } : {}) },
      data: {
        status: target,
        statusLogs: { create: { fromStatus: order.status, toStatus: target, userId: Number(user.id) } },
      },
    });
    // Resuming never confirms the customer or changes MAXMA bonuses. Only already-ready orders rejoin export.
    if (!hold && ["payment", "approved"].includes(target)) kickOrderTo1C(id);
    return NextResponse.json({ order: updated });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2025") return NextResponse.json({ error: "Заказ уже изменился или началась передача в 1С. Обновите карточку." }, { status: 409 });
    throw error;
  }
}

export const POST = lockedByOrderId(changeContact);
