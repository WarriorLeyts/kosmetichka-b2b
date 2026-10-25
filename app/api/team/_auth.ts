import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { JWTPayload } from "jose";
import { verifyToken } from "@/lib/auth";

/**
 * Auth for the staff mobile app («Косметичка Team»).
 *
 * The app logs in with POST /api/admin/login, which sets the httpOnly
 * `admin_token` cookie (JWT { id, email: <login>, role }). These helpers read
 * that cookie. /api/team/* is NOT covered by middleware.ts, so every route
 * must call requireStaff() itself.
 */

export type StaffRole = "admin" | "manager" | "picker";

export type StaffSession = {
  id: number;
  /** JWT `email` claim — holds User.login */
  login: string;
  role: StaffRole;
};

/** Same as /admin pages and /api/admin/* (middleware.ts + requireAdmin) */
export const ADMIN_MANAGER: readonly StaffRole[] = ["admin", "manager"];
/** Same as /admin/users pages (payload.role !== "admin" → redirect) */
export const ADMIN_ONLY: readonly StaffRole[] = ["admin"];
/** Same as /picker pages (middleware.ts: admin, manager and picker) */
export const ANY_STAFF: readonly StaffRole[] = ["admin", "manager", "picker"];

function isStaffRole(value: unknown): value is StaffRole {
  return value === "admin" || value === "manager" || value === "picker";
}

/** Returns the verified `admin_token` payload, or null when missing/invalid. */
export async function getStaffPayload(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  return await verifyToken(token);
}

/** Returns the typed staff session, or null when not logged in as staff. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const payload = await getStaffPayload();
  if (!payload) return null;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!isStaffRole(payload.role)) return null;
  return {
    id,
    login: typeof payload.email === "string" ? payload.email : "",
    role: payload.role,
  };
}

export type StaffAuthResult =
  | { ok: true; session: StaffSession }
  | { ok: false; response: NextResponse };

/**
 * 401 when there is no valid staff session, 403 when the role is not allowed.
 * Usage:
 *   const auth = await requireStaff(ADMIN_MANAGER);
 *   if (!auth.ok) return auth.response;
 */
export async function requireStaff(
  roles: readonly StaffRole[]
): Promise<StaffAuthResult> {
  const session = await getStaffSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Не авторизован" }, { status: 401 }),
    };
  }
  if (!roles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
