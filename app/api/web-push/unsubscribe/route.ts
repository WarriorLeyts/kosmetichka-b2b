import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/web-push/unsubscribe { endpoint } — this browser stops getting notifications.
 * No login needed: only the browser itself knows its endpoint (works right after logout too).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint ?? "");
  if (endpoint.startsWith("https://")) await prisma.webPushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
