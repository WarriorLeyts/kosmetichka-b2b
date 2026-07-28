import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
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

  const payload = await verifyToken(token);
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

  // Confirmation only makes sense in "consultation" status
  if (order.status !== "consultation") {
    return NextResponse.json(
      { error: "Подтверждение недоступно для текущего статуса заказа" },
      { status: 400 }
    );
  }

  if (order.customerConfirmed) {
    return NextResponse.json({ success: true }); // idempotent
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { customerConfirmed: true },
  });

  return NextResponse.json({ success: true });
}
