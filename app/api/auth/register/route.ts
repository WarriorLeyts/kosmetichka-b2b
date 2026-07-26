import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

function normalizePhone(value: string | null | undefined) {
  if (!value) return "";

  const digits = String(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("7")) {
    return "8" + digits.slice(1);
  }

  return digits;
}

// For SMS AERO format (7XXXXXXXXXX)
function toSmsAeroPhone(value: string): string {
  const digits = String(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;

  return digits;
}

async function verifySmartCaptcha(token: string, ip: string): Promise<boolean> {
  const serverKey = process.env.SMARTCAPTCHA_SERVER_KEY;
  if (!serverKey) {
    console.error("SMARTCAPTCHA_SERVER_KEY не задан");
    return false;
  }

  try {
    const url = new URL("https://smartcaptcha.yandexcloud.net/validate");
    url.searchParams.set("secret", serverKey);
    url.searchParams.set("token", token);
    url.searchParams.set("ip", ip);

    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json();

    return data.status === "ok";
  } catch (err) {
    console.error("Ошибка проверки SmartCaptcha:", err);
    return false;
  }
}

export async function POST(request: Request) {
  const { name, phone, email, password, captchaToken, smsCode } = await request.json();

  // ─── Проверка капчи ───────────────────────────────────────────
  if (!captchaToken) {
    return NextResponse.json(
      { error: "Капча не пройдена" },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const captchaOk = await verifySmartCaptcha(captchaToken, ip);
  if (!captchaOk) {
    return NextResponse.json(
      { error: "Проверка капчи не пройдена. Попробуйте ещё раз." },
      { status: 400 }
    );
  }

  // ─── Проверка SMS-кода ────────────────────────────────────────
  if (!smsCode) {
    return NextResponse.json(
      { error: "Введите код подтверждения из SMS" },
      { status: 400 }
    );
  }

  const smsPhone = toSmsAeroPhone(phone || "");

  const smsRecord = await prisma.smsCode.findFirst({
    where: {
      phone: smsPhone,
      code: String(smsCode).trim(),
      used: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!smsRecord) {
    return NextResponse.json(
      { error: "Неверный или истёкший код подтверждения" },
      { status: 400 }
    );
  }

  // Помечаем код как использованный
  await prisma.smsCode.update({
    where: { id: smsRecord.id },
    data: { used: true },
  });

  // ─── Основная логика регистрации ─────────────────────────────
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!name || !cleanPhone || !cleanEmail || !password) {
    return NextResponse.json(
      { error: "Заполните имя, телефон, email и пароль" },
      { status: 400 }
    );
  }

  const exists = await prisma.customer.findFirst({
    where: {
      OR: [
        { email: cleanEmail },
        { phone: cleanPhone },
      ],
    },
  });

  if (exists) {
    return NextResponse.json(
      { error: "Такой клиент уже зарегистрирован" },
      { status: 400 }
    );
  }

  const oneCCustomer = await prisma.oneCCustomer.findFirst({
    where: {
      OR: [
        { phone: cleanPhone },
        { name: { contains: cleanPhone } },
      ],
    },
  });

  const hashedPassword = await bcrypt.hash(password, 10);

  const customer = await prisma.customer.create({
    data: {
      name,
      phone: cleanPhone,
      email: cleanEmail,
      password: hashedPassword,

      oneCId: oneCCustomer?.oneCId || null,

      isApproved: Boolean(oneCCustomer),
      isActive: true,

      manager: oneCCustomer?.manager || null,
      role: "customer",
      priceType: oneCCustomer?.priceType || "wholesale",
    },
  });

  if (oneCCustomer) {
    const token = await createToken({
      id: customer.id,
      email: customer.email || "",
      role: customer.role || "customer",
    });

    const cookieStore = await cookies();

    cookieStore.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return NextResponse.json({
    success: true,
    autoLogin: Boolean(oneCCustomer),
    oneCLinked: Boolean(oneCCustomer),

    message: oneCCustomer
      ? "Регистрация успешно завершена."
      : "Заявка отправлена. Ожидайте подтверждения администратора.",
  });
}
