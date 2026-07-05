import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

type Props = { params: Promise<{ id: string }> };

// POST /api/orders/[id]/confirm
// Customer confirms changes during consultation
export async function POST(_request: NextRequest, { params }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const payload = await verifyToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  if (order.status !== "consultation") {
    return NextResponse.json(
      { error: "Подтверждение доступно только при статусе «На консультации»" },
      { status: 400 }
    );
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { customerConfirmed: true },
  });

  return NextResponse.json({ ok: true });
}
