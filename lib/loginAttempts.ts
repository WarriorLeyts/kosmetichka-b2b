import { prisma } from "@/lib/prisma";

/**
 * DB-based rate limiter (LoginAttempt table) — survives server restarts.
 * Returns false when `key` has used up `max` attempts inside the window.
 */
export async function checkLoginAttempt(
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const now = new Date();

  const existing = await prisma.loginAttempt.findUnique({ where: { ip: key } });

  if (!existing || existing.resetAt < now) {
    // First attempt or window expired — start a fresh window
    await prisma.loginAttempt.upsert({
      where: { ip: key },
      update: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
      create: { ip: key, count: 1, resetAt: new Date(now.getTime() + windowMs) },
    });
    return true;
  }

  if (existing.count >= max) return false;

  await prisma.loginAttempt.update({
    where: { ip: key },
    data: { count: { increment: 1 } },
  });
  return true;
}

export async function clearLoginAttempts(key: string) {
  await prisma.loginAttempt.deleteMany({ where: { ip: key } }).catch(() => {});
}
