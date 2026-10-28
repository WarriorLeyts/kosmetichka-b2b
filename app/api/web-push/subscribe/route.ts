import { NextResponse } from "next/server";
import { currentCustomerId } from "@/app/api/mobile/_auth";
import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rateLimit";
import { getVapidConfig, validSubscriptionKeys } from "@/lib/webPush";

const limiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
const MAX_PER_CUSTOMER = 10;

/**
 * POST /api/web-push/subscribe { endpoint, keys: { p256dh, auth } } — this browser gets the
 * customer's notifications. A subscription moves to the account that registered it last.
 */
export async function POST(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!getVapidConfig()) return NextResponse.json({ error: "Уведомления недоступны" }, { status: 503 });
  if (!limiter.check(`c${id}`).ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint ?? "");
  const p256dh = String(body?.keys?.p256dh ?? "");
  const auth = String(body?.keys?.auth ?? "");
  let okUrl = false;
  try {
    okUrl = endpoint.length <= 1000 && new URL(endpoint).protocol === "https:";
  } catch {}
  if (!okUrl || !validSubscriptionKeys(p256dh, auth)) return NextResponse.json({ error: "Неверная подписка" }, { status: 400 });

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;
  await prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userAgent, customerId: id },
    update: { p256dh, auth, userAgent, customerId: id, lastSeenAt: new Date() },
  });
  // at most 10 browsers per account: the oldest go
  const extra = await prisma.webPushSubscription.findMany({
    where: { customerId: id },
    orderBy: { lastSeenAt: "desc" },
    skip: MAX_PER_CUSTOMER,
    select: { id: true },
  });
  if (extra.length) await prisma.webPushSubscription.deleteMany({ where: { id: { in: extra.map((x) => x.id) } } });
  return NextResponse.json({ ok: true });
}
