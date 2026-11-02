import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../_auth";

/** an Expo push token: ExponentPushToken[…] / ExpoPushToken[…] */
const TOKEN = /^Expo(nent)?PushToken\[[\w-]{10,200}\]$/;

/**
 * POST { token, platform } — the staff app on a phone registers its push token (admin / manager:
 * the roles that get staff notifications). A token that was another employee's (shared phone)
 * moves to the one signed in now. DELETE { token } — on sign-out.
 */
export async function POST(request: Request) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  const platform = body?.platform === "ios" ? "ios" : "android";
  if (!TOKEN.test(token)) return NextResponse.json({ error: "Неверный токен" }, { status: 400 });
  await prisma.staffPushToken.upsert({
    where: { token },
    create: { token, userId: auth.session.id, platform },
    update: { userId: auth.session.id, platform, lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const token = String(body?.token ?? "");
  if (token) await prisma.staffPushToken.deleteMany({ where: { token, userId: auth.session.id } });
  return NextResponse.json({ ok: true });
}
