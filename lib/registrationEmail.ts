import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { resolveJwtSecret } from "./jwtSecret";

export function emailCodeHash(id: string, email: string, phone: string, code: string): string {
  return createHmac("sha256", resolveJwtSecret()).update(JSON.stringify([id, email, phone, code])).digest("hex");
}

/** Five guesses per challenge, persisted across restarts; email and contact phone are bound to it. */
export async function verifyRegistrationEmail(id: unknown, email: string, phone: string, code: unknown): Promise<string | null> {
  if (typeof id !== "string" || id.length > 100 || typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const allowed = await prisma.registrationEmailCode.updateMany({
    where: { id, email, phone, used: false, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
    data: { attempts: { increment: 1 } },
  });
  if (!allowed.count) return null;
  const row = await prisma.registrationEmailCode.findUnique({ where: { id } });
  if (!row) return null;
  const expected = emailCodeHash(id, email, phone, code);
  return row.codeHash.length === expected.length && timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(expected)) ? id : null;
}

export async function consumeRegistrationEmail(id: string): Promise<boolean> {
  const result = await prisma.registrationEmailCode.updateMany({
    where: { id, used: false, expiresAt: { gt: new Date() } }, data: { used: true },
  });
  return result.count === 1;
}
