import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rateLimit";
import { getVapidConfig, parseSubscription } from "@/lib/webPush";
import { ANY_STAFF, requireStaff } from "../../_auth";

const limiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
const MAX_PER_USER = 10;

/**
 * POST /api/team/web-push/subscribe { endpoint, keys: { p256dh, auth } } — this browser gets staff
 * notifications (new orders, customer messages…). A subscription moves to the account that registered it last.
 */
export async function POST(request: Request) {
  // a foreign page must not attach its own endpoint to a staff session
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  const userId = auth.session.id;
  if (!getVapidConfig()) return NextResponse.json({ error: "Уведомления недоступны" }, { status: 503 });
  if (!limiter.check(`s${userId}`).ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

  const sub = parseSubscription(await request.json().catch(() => null));
  if (!sub) return NextResponse.json({ error: "Неверная подписка" }, { status: 400 });

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;
  await prisma.staffWebPushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { ...sub, userAgent, userId },
    update: { p256dh: sub.p256dh, auth: sub.auth, userAgent, userId, lastSeenAt: new Date() },
  });
  // at most 10 browsers per account: the oldest go
  const extra = await prisma.staffWebPushSubscription.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    skip: MAX_PER_USER,
    select: { id: true },
  });
  if (extra.length) await prisma.staffWebPushSubscription.deleteMany({ where: { id: { in: extra.map((x) => x.id) } } });
  return NextResponse.json({ ok: true });
}
