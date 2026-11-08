import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmOrderFor } from "@/lib/orderConfirm";
import { lockedByOrderId } from "@/lib/orderLock";
import { staffSeesOrder } from "@/lib/staffScope";

/**
 * POST /api/admin/orders/[id]/confirm — a manager or an admin presses «Подтвердить заказ» for the
 * customer (they agreed by phone, in a messenger…). Same rules as the customer's own button; the chat
 * shows who confirmed. Pickers can't.
 */
async function confirmForCustomer(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(); // admin or manager
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  if (!(await staffSeesOrder(user, Number(id)))) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const order = await prisma.order.findUnique({ where: { id: Number(id) } });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const staff = await prisma.user.findUnique({ where: { id: Number(user.id) }, select: { id: true, name: true } });
  const error = await confirmOrderFor(order, { id: Number(user.id), name: staff?.name ?? null });
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}

export const POST = lockedByOrderId(confirmForCustomer);
