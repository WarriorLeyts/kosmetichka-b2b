import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "approved" },
  });

  // Удаляем переписку — заказ подтверждён, чат больше не нужен
  await prisma.orderMessage.deleteMany({ where: { orderId } }).catch(() => {});

  return NextResponse.json({ success: true });
}
