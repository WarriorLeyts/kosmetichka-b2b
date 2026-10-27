import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../_auth";

/** POST /api/mobile/notifications/read { ids?: number[] } — marks the given ones (or all) as read. */
export async function POST(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((x: number) => Number.isInteger(x) && x > 0).slice(0, 500) : null;
  await prisma.notification.updateMany({
    where: { customerId: id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  const unread = await prisma.notification.count({ where: { customerId: id, readAt: null } });
  return NextResponse.json({ unread });
}
