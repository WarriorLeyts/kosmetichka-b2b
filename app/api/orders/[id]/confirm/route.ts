import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const payload = await verifyCustomerToken(token);
  if (!payload?.id) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  // Only the order owner can confirm
  if (order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  // Confirmation: the staff changed the order and wait for the customer (confirmRequestedAt), or the
  // old «consultation» flow. Not once the order is «Заказ оформлен» / done / cancelled.
  const waiting = !!order.confirmRequestedAt;
  const legacy = order.status === "consultation" && !order.customerConfirmed;
  if (["payment", "exported", "cancelled"].includes(order.status) || (!waiting && !legacy)) {
    if (order.customerConfirmed) return NextResponse.json({ success: true }); // idempotent
    return NextResponse.json({ error: "Подтверждение недоступно для текущего статуса заказа" }, { status: 400 });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { customerConfirmed: true, confirmRequestedAt: null, staffChangedAt: null },
  });
  // staff see it at once in the order chat (admin, Team, Bitrix); «Заказ оформлен» is now available
  await prisma.orderMessage
    .create({ data: { orderId, source: "customer", text: "✅ Клиент подтвердил изменения в заказе" } })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
