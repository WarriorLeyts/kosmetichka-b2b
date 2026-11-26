import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { staffSeesOrder } from "@/lib/staffScope";
import { lockedByOrderId } from "@/lib/orderLock";
import { startOrderService } from "@/lib/orderServiceStart";
import { ADMIN_MANAGER, requireStaff } from "../../../_auth";

async function take(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный номер заказа" }, { status: 400 });
  if (!(await staffSeesOrder(auth.session, id))) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const user = await prisma.user.findUnique({ where: { id: auth.session.id }, select: { name: true } });
  const result = await startOrderService(id, { id: auth.session.id, name: user?.name?.trim() || "магазина", login: auth.session.login });
  if (result.kind === "missing") return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (result.kind === "started" || result.kind === "already") return NextResponse.json({ success: true });
  return NextResponse.json({ error: result.kind === "owned" ? "Другой менеджер уже взял этот заказ в работу. Обновите заказ." : "Этап заказа изменился. Обновите заказ." }, { status: 409 });
}
export const POST = lockedByOrderId(take);
