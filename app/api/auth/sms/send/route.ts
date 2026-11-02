import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSmsAeroPhone } from "@/lib/phone";
import { getClientIp } from "@/lib/rateLimit";
import { sendMail } from "@/lib/mail";

function generateCode(): string {
  // crypto, not Math.random: Math.random is predictable from its earlier outputs
  return String(randomInt(100000, 1000000));
}

async function sendSmsAero(phone: string, text: string): Promise<boolean> {
  const email = process.env.SMSAERO_EMAIL;
  const apiKey = process.env.SMSAERO_API_KEY;
  const sign = process.env.SMSAERO_SIGN || "Kosmetichka";

  if (!email || !apiKey) {
    console.error("SMSAERO_EMAIL или SMSAERO_API_KEY не заданы");
    return false;
  }

  const credentials = Buffer.from(`${email}:${apiKey}`).toString("base64");

  try {
    const url = new URL("https://gate.smsaero.ru/v2/sms/send");
    url.searchParams.set("number", phone);
    url.searchParams.set("text", text);
    url.searchParams.set("sign", sign);
    url.searchParams.set("channel", "DIRECT");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    // the response holds the phone and the SMS text (the code) — log only the outcome
    if (data?.success !== true) console.error("SMS AERO: not sent:", data?.message ?? "unknown error");

    return data.success === true;
  } catch (err) {
    console.error("Ошибка отправки SMS:", err);
    return false;
  }
}

/** SMS a day: per phone number, per IP, for the whole site (audit P2-05) */
const SMS_PHONE_DAY = 5;
const SMS_IP_DAY = 20;
const SMS_SITE_DAY = 300;

/** Counts one more request under `key` (LoginAttempt row); false once `max` is used up in the window. */
async function bump(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const row = await prisma.loginAttempt.findUnique({ where: { ip: key } });
  if (row && row.resetAt > now) {
    if (row.count >= max) return false;
    await prisma.loginAttempt.update({ where: { ip: key }, data: { count: { increment: 1 } } });
    return true;
  }
  await prisma.loginAttempt.upsert({
    where: { ip: key },
    update: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
    create: { ip: key, count: 1, resetAt: new Date(now.getTime() + windowMs) },
  });
  return true;
}

/** One e-mail a day to ADMIN_EMAIL when the site-wide SMS limit stops sending. */
async function alertAdminOnce() {
  try {
    const to = process.env.ADMIN_EMAIL;
    if (!to || !(await bump("sms_alert", 1, 24 * 60 * 60 * 1000))) return;
    await sendMail({
      to,
      subject: "Подозрительно много SMS — отправка кодов приостановлена",
      html: `<p>За последние сутки сайт отправил ${SMS_SITE_DAY} SMS с кодами — это суточный предел.
        Новые коды не отправляются, пока число за сутки не станет меньше. Возможно, бот перебирает номера.</p>`,
    });
  } catch (e) {
    console.error("[sms] alert", e);
  }
}

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: "Укажите номер телефона" }, { status: 400 });
    }

    const smsPhone = toSmsAeroPhone(phone);
    if (!smsPhone) {
      return NextResponse.json({ error: "Неверный формат номера телефона" }, { status: 400 });
    }

    const ip = getClientIp(request);
    const DAY_MS = 24 * 60 * 60 * 1000;
    const dayAgo = new Date(Date.now() - DAY_MS);

    // Daily limits (audit P2-05): a bot with many IPs must not burn the SMS balance.
    // Codes live in SmsCode for ~24 h (cleaned below), so they count the last day.
    if ((await prisma.smsCode.count({ where: { phone: smsPhone, createdAt: { gte: dayAgo } } })) >= SMS_PHONE_DAY) {
      return NextResponse.json(
        { error: "Слишком много запросов кода. Попробуйте завтра или напишите нам." },
        { status: 429 }
      );
    }
    if ((await prisma.smsCode.count({ where: { createdAt: { gte: dayAgo } } })) >= SMS_SITE_DAY) {
      console.error(`[sms] site daily limit ${SMS_SITE_DAY} reached — sending paused`);
      void alertAdminOnce();
      return NextResponse.json(
        { error: "Отправка кодов временно недоступна. Попробуйте позже или напишите нам." },
        { status: 429 }
      );
    }
    // per IP: 10 an hour and 20 a day
    if (!(await bump(`sms_${ip}`, 10, 60 * 60 * 1000)) || !(await bump(`sms_day_${ip}`, SMS_IP_DAY, DAY_MS))) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429 }
      );
    }

    // Rate limit: не чаще 1 раза в 60 секунд на номер
    const recent = await prisma.smsCode.findFirst({
      where: {
        phone: smsPhone,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recent) {
      return NextResponse.json(
        { error: "Код уже отправлен. Подождите 60 секунд перед повторной отправкой." },
        { status: 429 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    // Инвалидируем старые неиспользованные коды для этого номера
    await prisma.smsCode.updateMany({
      where: { phone: smsPhone, used: false },
      data: { used: true },
    });

    // Очищаем истёкшие коды (старше 24 часов) чтобы таблица не росла
    await prisma.smsCode.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    await prisma.smsCode.create({
      data: { phone: smsPhone, code, expiresAt },
    });

    const text = `${code} — ваш код подтверждения в КОСМЕТИЧКА`;
    const sent = await sendSmsAero(smsPhone, text);

    if (!sent) {
      return NextResponse.json(
        { error: "Не удалось отправить SMS. Попробуйте позже." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("SMS send error:", err);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
