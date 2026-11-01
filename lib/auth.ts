import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveJwtSecret } from "@/lib/jwtSecret";

const secret = new TextEncoder().encode(resolveJwtSecret());

export async function createToken(payload: {
  id: number;
  email: string;
  role: string;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secret));
  } catch {
    return null;
  }
  // Staff tokens (everything but "customer") live 7 days. The signature alone would keep a deleted
  // employee — or one whose role was lowered — in the admin until then, so the account is checked
  // on every use: it must still exist and still have the role written in the token.
  if (payload.role !== "customer" && !(await staffStillValid(payload.id, payload.role))) return null;
  return payload;
}

/** The staff account `id` still exists and has role `role`. */
export async function staffStillValid(id: unknown, role: unknown): Promise<boolean> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || typeof role !== "string") return false;
  const user = await prisma.user.findUnique({ where: { id: n }, select: { role: true } });
  return user?.role === role;
}

/**
 * Verifies the admin/manager session cookie for use inside API route
 * handlers (middleware.ts only protects /admin/* pages, not /api/admin/*
 * routes, so every admin API route must call this itself).
 */
export async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);

  if (!payload || (payload.role !== "admin" && payload.role !== "manager")) {
    return null;
  }

  return payload;
}

/**
 * Like requireAdmin(), but only for role "admin" (managers are rejected).
 * Used for staff-account management (/api/admin/users*), matching the
 * /admin/users pages, which are admin-only.
 */
export async function requireAdminRole() {
  const payload = await requireAdmin();
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

/**
 * A 10-minute link to one order's invoice for the phone app: the in-app browser that opens it has
 * no access to the app's login cookie, so the link itself proves who may see the invoice. It is
 * useless as a login — `verifyToken` rejects it (role "invoice", no staff account 0).
 */
export async function createInvoiceToken(orderId: number, customerId: number) {
  return await new SignJWT({ id: 0, role: "invoice", inv: orderId, cid: customerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

/** The customer id the invoice link `token` was made for, if it is valid for order `orderId`. */
export async function verifyInvoiceToken(token: string, orderId: number): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "invoice" || payload.inv !== orderId) return null;
    return typeof payload.cid === "number" ? payload.cid : null;
  } catch {
    return null;
  }
}
