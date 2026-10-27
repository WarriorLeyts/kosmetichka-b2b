import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";

const VALID = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

/**
 * POST /api/mobile/push-token { token, platform } — this phone gets the customer's push notifications.
 * A token moves to the account that registered it last (one phone, one account at a time).
 */
export async function POST(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  if (!VALID.test(token)) return NextResponse.json({ error: "Неверный токен" }, { status: 400 });
  const platform = body?.platform === "ios" ? "ios" : "android";
  await prisma.pushToken.upsert({
    where: { token },
    create: { token, customerId: id, platform },
    update: { customerId: id, platform, lastSeenAt: new Date() },
  });
  // at most 10 devices per account: the oldest go
  const extra = await prisma.pushToken.findMany({ where: { customerId: id }, orderBy: { lastSeenAt: "desc" }, skip: 10, select: { id: true } });
  if (extra.length) await prisma.pushToken.deleteMany({ where: { id: { in: extra.map((x) => x.id) } } });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/mobile/push-token { token } — on logout: this phone stops getting this account's pushes. */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  if (VALID.test(token)) await prisma.pushToken.deleteMany({ where: { token } });
  return NextResponse.json({ ok: true });
}
