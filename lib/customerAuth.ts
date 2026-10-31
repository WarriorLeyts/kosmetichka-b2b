import type { JWTPayload } from "jose";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { createToken, verifyToken } from "@/lib/auth";

/**
 * Verifies a customer `auth_token` like verifyToken(), and additionally
 * rejects customers that no longer exist or were blocked by a manager
 * (Customer.isActive = false), so a block takes effect immediately instead of
 * when the 7-day token expires. Only tokens with role "customer" are accepted —
 * a staff admin_token must never be read as a customer. Returns the payload, or null.
 */
export async function verifyCustomerToken(token: string): Promise<JWTPayload | null> {
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  // admin_token и auth_token подписаны одним секретом и устроены одинаково ({id, email, role}):
  // без этой проверки токен сотрудника (id = User.id) читался бы как покупатель с тем же Customer.id
  if (payload.role !== "customer") return null;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { isActive: true, passwordChangedAt: true },
  });
  if (!customer || !customer.isActive) return null;
  // the password was changed after this login: a stolen or forgotten session ends with it
  if (customer.passwordChangedAt && (payload.iat ?? 0) < Math.floor(customer.passwordChangedAt.getTime() / 1000)) return null;

  return payload;
}

/**
 * A fresh login cookie for customer `c` — after the customer changed his own password, so this
 * device stays signed in while the other sessions end.
 */
export async function renewCustomerSession(c: { id: number; email: string | null; phone: string | null; role: string | null }) {
  const token = await createToken({ id: c.id, email: c.email ?? c.phone ?? String(c.id), role: c.role || "customer" });
  (await cookies()).set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
