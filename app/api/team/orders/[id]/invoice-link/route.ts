import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInvoiceToken } from "@/lib/auth";
import { ADMIN_MANAGER, requireStaff } from "../../../_auth";
import { staffSeesOrder } from "@/lib/staffScope";

/**
 * POST /api/team/orders/:id/invoice-link — a 7-day link to the order's invoice PDF for staff to send
 * the customer (or anyone): opens without signing in, only this order.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (!(await staffSeesOrder(auth.session, id))) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const order = await prisma.order.findUnique({ where: { id }, select: { customerId: true } });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  const t = await createInvoiceToken(id, order.customerId, "staff");
  return NextResponse.json({ pdf: `/api/orders/${id}/invoice-pdf?t=${encodeURIComponent(t)}`, filename: `Счёт №${id}.pdf` });
}
