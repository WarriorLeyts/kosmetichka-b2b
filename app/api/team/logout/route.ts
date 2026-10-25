import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/team/logout — sign-out for every staff role (admin, manager, picker).
 * /api/admin/logout is closed to pickers by middleware.ts, so the app uses this one.
 *
 * Browsers mark requests from other sites with `Sec-Fetch-Site: cross-site`;
 * those are refused so a foreign page can't log staff out (login CSRF-style).
 * The native app sends no such header and is unaffected.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.delete("admin_token");
  return NextResponse.json({ success: true });
}
