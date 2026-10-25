import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

export type PickerUser = { id: number; role: "admin" | "manager" | "picker" };

/** Staff session from the admin_token cookie (admin, manager or picker), or null. */
export async function getPickerUser(): Promise<PickerUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const role = payload.role;
  if (role !== "admin" && role !== "manager" && role !== "picker") return null;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, role };
}

/** Positive integer id from a route param / body field; null when invalid. */
export function parseId(raw: unknown): number | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Admins and managers may work with any order. A picker may work with an
 * unassigned order or one assigned to them, but not with an order a manager
 * assigned to another picker. Returns a 403 response when access is denied.
 */
export function denyIfNotAllowed(
  user: PickerUser,
  order: { pickerId: number | null }
): NextResponse | null {
  if (user.role !== "picker") return null;
  if (order.pickerId === null || order.pickerId === user.id) return null;
  return NextResponse.json(
    { error: "Заказ назначен другому сборщику" },
    { status: 403 }
  );
}
