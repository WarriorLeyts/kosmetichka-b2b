import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/team/logout — sign-out for every staff role (admin, manager, picker).
 * /api/admin/logout is closed to pickers by middleware.ts, so the app uses this one.
 */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_token");
  return NextResponse.json({ success: true });
}
