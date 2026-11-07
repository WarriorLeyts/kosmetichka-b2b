import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { prisma } from "@/lib/prisma";
import { confirmOrderFor } from "@/lib/orderConfirm";
import { lockedByOrderId } from "@/lib/orderLock";

async function confirmOrder(
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

  // the same rules as when a manager confirms for the customer (lib/orderConfirm.ts)
  const error = await confirmOrderFor(order);
  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ success: true });
}

// one change of an order at a time (double taps, the customer and the manager at once)
export const POST = lockedByOrderId(confirmOrder);
