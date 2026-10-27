import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";

/**
 * GET /api/mobile/notifications?before=<id> — the customer's notifications, newest first (30 per page),
 * plus the unread count for the bell. ?count=1 — only { unread } (cheap, for the bell dot).
 */
export async function GET(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const unread = await prisma.notification.count({ where: { customerId: id, readAt: null } });
  if (sp.get("count") === "1") return NextResponse.json({ unread });

  const before = Number(sp.get("before")) || 0;
  const items = await prisma.notification.findMany({
    where: { customerId: id, ...(before > 0 ? { id: { lt: before } } : {}) },
    orderBy: { id: "desc" },
    take: 30,
    select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
  });
  return NextResponse.json({
    unread,
    items: items.map((n) => ({ ...n, read: n.readAt != null, readAt: undefined, createdAt: n.createdAt.toISOString() })),
    hasMore: items.length === 30,
  });
}
