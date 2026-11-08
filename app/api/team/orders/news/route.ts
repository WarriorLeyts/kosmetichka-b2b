import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerChatMarks } from "@/lib/customerChatMarks";
import { ADMIN_MANAGER, requireStaff } from "../../_auth";
import { orderScopeWhere, staffScope } from "@/lib/staffScope";

/** how far back the «Заказы» tab badge looks for customer messages */
const DAYS = 14;

/**
 * GET /api/team/orders/news — chat marks of the orders the customer wrote in during the last 14 days
 * (messages, confirmations and change lines are all customer chat lines). The Team app compares them
 * with what this device has opened and shows the count on the «Заказы» tab.
 */
export async function GET() {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
  const mine = orderScopeWhere(await staffScope(auth.session));
  const rows = await prisma.orderMessage.findMany({
    where: { source: "customer", isFromPicker: false, createdAt: { gte: since }, order: mine },
    distinct: ["orderId"],
    select: { orderId: true },
    take: 300,
  });
  const marks = await customerChatMarks(rows.map((r) => r.orderId));
  return NextResponse.json({ orders: [...marks].map(([id, m]) => ({ id, ...m })) });
}
