import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const payload = await verifyToken(token);

  if (!payload?.id) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
  });

  if (!order || order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  // Once a manager has touched the order (approved/exported) it's already
  // on its way to 1С — the customer can only withdraw it while it's still
  // sitting in the confirmation queue.
  if (order.status !== "pending") {
    return NextResponse.json(
      { error: "Заказ уже в обработке, отменить его можно только до подтверждения менеджером" },
      { status: 400 }
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "cancelled" },
  });

  return NextResponse.json({ success: true });
}
