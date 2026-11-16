import { randomInt, randomUUID, createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { foreignContactPhone, registrationEmail } from "@/lib/phone";
import { getClientIp } from "@/lib/rateLimit";
import { checkLoginAttempt } from "@/lib/loginAttempts";
import { sendMail } from "@/lib/mail";
import { emailCodeHash } from "@/lib/registrationEmail";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = registrationEmail(body?.email);
  const phone = foreignContactPhone(body?.phone);
  if (!email || !phone) return NextResponse.json({ error: "Укажите email и иностранный номер с кодом страны, например +995…" }, { status: 400 });
  const key = createHash("sha256").update(email).digest("hex");
  const day = 24 * 60 * 60_000;
  if (!(await checkLoginAttempt(`reg_email_ip_${getClientIp(request)}`, 20, day)) ||
      !(await checkLoginAttempt(`reg_email_day_${key}`, 5, day)) ||
      !(await checkLoginAttempt(`reg_email_min_${key}`, 1, 60_000)) ||
      !(await checkLoginAttempt("reg_email_site", 500, day))) {
    return NextResponse.json({ error: "Слишком много запросов кода. Попробуйте позже." }, { status: 429 });
  }
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  await prisma.registrationEmailCode.updateMany({ where: { email, used: false }, data: { used: true } });
  await prisma.registrationEmailCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - day) } } });
  await prisma.registrationEmailCode.create({ data: { id, email, phone, codeHash: emailCodeHash(id, email, phone, code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  try {
    await sendMail({ to: email, subject: "Код регистрации в КОСМЕТИЧКА", html: `<p>Ваш код подтверждения регистрации:</p><p style="font-size:28px;font-weight:bold">${code}</p><p>Код действует 10 минут. Никому его не сообщайте.</p><p>Если вы не запрашивали код, проигнорируйте письмо.</p>` });
  } catch {
    await prisma.registrationEmailCode.updateMany({ where: { id }, data: { used: true } });
    return NextResponse.json({ error: "Не удалось отправить письмо. Попробуйте позже." }, { status: 503 });
  }
  return NextResponse.json({ success: true, challengeId: id });
}
