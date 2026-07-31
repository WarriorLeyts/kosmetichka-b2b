import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSmsAeroPhone } from "@/lib/phone";

function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
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
    console.log("SMS AERO response:", JSON.stringify(data));

    return data.success === true;
  } catch (err) {
    console.error("Ошибка отправки SMS:", err);
    return false;
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

    // Rate limit: не более 10 SMS в час с одного IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const SMS_IP_MAX = 10;
    const SMS_IP_WINDOW_MS = 60 * 60 * 1000; // 1 час
    const smsIpKey = `sms_${ip}`;
    const now = new Date();

    const ipAttempt = await prisma.loginAttempt.findUnique({ where: { ip: smsIpKey } });

    if (ipAttempt && ipAttempt.resetAt > now) {
      if (ipAttempt.count >= SMS_IP_MAX) {
        return NextResponse.json(
          { error: "Слишком много запросов. Попробуйте через час." },
          { status: 429 }
        );
      }
      await prisma.loginAttempt.update({
        where: { ip: smsIpKey },
        data: { count: { increment: 1 } },
      });
    } else {
      await prisma.loginAttempt.upsert({
        where: { ip: smsIpKey },
        update: { count: 1, resetAt: new Date(now.getTime() + SMS_IP_WINDOW_MS) },
        create: { ip: smsIpKey, count: 1, resetAt: new Date(now.getTime() + SMS_IP_WINDOW_MS) },
      });
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

    const text = `Ваш код подтверждения: ${code}. Действителен 10 минут.`;
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
