import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { liveStream } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * GET /api/live — the customer's live hints (website and phone app): his orders changed (status, items,
 * chat), a new notification. The screens reload their own data when a hint arrives.
 */
export async function GET(request: Request) {
  const token = (await cookies()).get("auth_token")?.value;
  const payload = token ? await verifyCustomerToken(token) : null;
  const customerId = Number(payload?.id);
  if (!Number.isInteger(customerId) || customerId <= 0) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  return liveStream(request, (e) => {
    if (e.t === "order" && e.customerId === customerId) return { t: "order", id: e.id };
    if (e.t === "notify" && e.customerId === customerId) return { t: "notify" };
    return null;
  });
}
