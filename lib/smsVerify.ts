import { prisma } from "@/lib/prisma";
import { toSmsAeroPhone } from "@/lib/phone";

/**
 * The code from the SMS sent to `phone` (/api/auth/sms/send): valid, not used, not expired.
 * Returns the code's id (to mark it used once everything else is checked) or null.
 */
export async function findSmsCode(phone: string, code: unknown): Promise<number | null> {
  const smsPhone = toSmsAeroPhone(phone);
  const c = String(code ?? "").trim();
  if (!smsPhone || !/^\d{4,8}$/.test(c)) return null;
  const rec = await prisma.smsCode.findFirst({
    where: { phone: smsPhone, code: c, used: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return rec?.id ?? null;
}

export async function spendSmsCode(id: number) {
  await prisma.smsCode.update({ where: { id }, data: { used: true } });
}
