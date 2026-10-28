import { ANY_STAFF, requireStaff } from "../_auth";
import { liveStream } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** GET /api/team/live — staff (admin site / Team app): any order changed (new order, status, items, chat). */
export async function GET(request: Request) {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  return liveStream(request, (e) => (e.t === "order" ? { t: "order", id: e.id } : null));
}
