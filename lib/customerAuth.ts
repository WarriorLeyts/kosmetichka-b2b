import type { JWTPayload } from "jose";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

/**
 * Verifies a customer `auth_token` like verifyToken(), and additionally
 * rejects customers that no longer exist or were blocked by a manager
 * (Customer.isActive = false), so a block takes effect immediately instead of
 * when the 7-day token expires. Returns the payload, or null.
 */
export async function verifyCustomerToken(token: string): Promise<JWTPayload | null> {
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return null;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!customer || !customer.isActive) return null;

  return payload;
}
