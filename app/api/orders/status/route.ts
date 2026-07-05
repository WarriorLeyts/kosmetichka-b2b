import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// Lightweight endpoint — returns order statuses + latest manager message per order.
// Used by OrderNotifications for polling (pending count + approval + unread messages).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return NextResponse.json({ pending: 0, statuses: [], managerMessages: [] });

    const payload = await verifyToken(token);
    if (!payload?.id) return NextResponse.json({ pending: 0, statuses: [], managerMessages: [] });

    const orders = await prisma.order.findMany({
      where: { customerId: Number(payload.id) },
      select: {
        id: true,
        status: true,
        messages: {
          where: { isFromPicker: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, text: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const pending = orders.filter((o) => o.status === "pending").length;

    const statuses = orders.map((o) => ({ id: o.id, status: o.status }));

    // Orders that have at least one manager message — include latest timestamp
    const managerMessages = orders
      .filter((o) => o.messages.length > 0)
      .map((o) => ({
        orderId: o.id,
        latestAt: o.messages[0].createdAt.toISOString(),
        preview: o.messages[0].text.slice(0, 60),
      }));

    return NextResponse.json({ pending, statuses, managerMessages });
  } catch {
    return NextResponse.json({ pending: 0, statuses: [], managerMessages: [] });
  }
}
