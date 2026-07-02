import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// Lightweight endpoint — returns order statuses for the current user.
// Used by OrderNotifications for polling (pending count + approval detection).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return NextResponse.json({ pending: 0, statuses: [] });

    const payload = await verifyToken(token);
    if (!payload?.id) return NextResponse.json({ pending: 0, statuses: [] });

    const orders = await prisma.order.findMany({
      where: { customerId: Number(payload.id) },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const pending = orders.filter((o) => o.status === "pending").length;
    return NextResponse.json({ pending, statuses: orders });
  } catch {
    return NextResponse.json({ pending: 0, statuses: [] });
  }
}
