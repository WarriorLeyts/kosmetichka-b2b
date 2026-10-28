import { NextResponse } from "next/server";
import { currentCustomerId } from "@/app/api/mobile/_auth";
import { getVapidConfig } from "@/lib/webPush";

/** GET /api/web-push/key — VAPID public key for PushManager.subscribe, or { enabled: false }. */
export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const cfg = getVapidConfig();
  if (!cfg) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, publicKey: cfg.publicKey.toString("base64url") });
}
