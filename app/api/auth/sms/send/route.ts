import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Normalize phone to 7XXXXXXXXXX (11 digits, starts with 7) for SMS AERO
function toSmsAeroPhone(value: string): string | null {
  const digits = String(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;

  return null;
}

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
