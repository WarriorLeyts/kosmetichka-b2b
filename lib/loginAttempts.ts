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

/**
 * Два счётчика на вход: по IP и по аккаунту. Раньше был только IP-счётчик, и он обнулялся при любом
 * успешном входе с этого IP — можно было чередовать 9 попыток подбора чужого пароля и вход в свой
 * аккаунт без ограничений. Теперь у каждого аккаунта свой лимит, и успешный вход сбрасывает только его.
 */
const ACCOUNT_MAX = 20;
const IP_MAX = 30;

export async function checkLoginLimits(prefix: string, ip: string, account: string, windowMs: number) {
  const okIp = await checkLoginAttempt(`${prefix}_${ip}`, IP_MAX, windowMs);
  const okAccount = await checkLoginAttempt(`${prefix}_acct_${account.trim().toLowerCase()}`, ACCOUNT_MAX, windowMs);
  return okIp && okAccount;
}

export async function clearLoginLimits(prefix: string, ip: string, account: string) {
  await clearLoginAttempts(`${prefix}_${ip}`);
  await clearLoginAttempts(`${prefix}_acct_${account.trim().toLowerCase()}`);
}
