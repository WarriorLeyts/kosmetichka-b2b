import { NextResponse } from "next/server";
import { getVapidConfig } from "@/lib/webPush";
import { ANY_STAFF, requireStaff } from "../../_auth";

/** GET /api/team/web-push/key — VAPID public key for the admin website, or { enabled: false }. */
export async function GET() {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  const cfg = getVapidConfig();
  if (!cfg) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, publicKey: cfg.publicKey.toString("base64url") });
}
