import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { createInvoiceToken } from "@/lib/auth";

/**
 * POST — a 10-minute link to this order's invoice for the phone app (its in-app browser does not
 * carry the login cookie, so /orders/N/invoice alone sent the customer to the login page).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("auth_token")?.value;
  const payload = token ? await verifyCustomerToken(token) : null;
  if (!payload?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const customerId = Number(payload.id);
  const order = await prisma.order.findUnique({ where: { id }, select: { customerId: true } });
  if (!order || order.customerId !== customerId) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const t = await createInvoiceToken(id, customerId);
  return NextResponse.json({ url: `/orders/${id}/invoice?t=${encodeURIComponent(t)}` });
}
