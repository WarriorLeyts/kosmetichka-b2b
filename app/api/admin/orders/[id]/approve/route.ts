import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUS_TRANSITIONS as TRANSITIONS } from "@/lib/orderStatus";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  const toStatus = "approved";
  const allowed = TRANSITIONS[order.status] || [];
  if (!allowed.includes(toStatus)) {
    return NextResponse.json(
      { error: `Нельзя перейти из "${order.status}" в "${toStatus}"` },
      { status: 400 }
    );
  }

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    }),
    prisma.orderStatusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        userId: user.id as number,
      },
    }),
  ]);

  return NextResponse.json({ success: true, order: updatedOrder });
}
