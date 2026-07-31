import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { normalizePhone, toSmsAeroPhone } from "@/lib/phone";

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

const AUTO_APPROVE_TYPES = new Set(["retail", "discount"]);

export async function POST(request: Request) {
  const { name, phone, email, password, captchaToken, smsCode, priceType: rawPriceType } = await request.json();
  const priceType = ["retail", "discount", "wholesale", "big_wholesale"].includes(rawPriceType)
    ? rawPriceType
    : "wholesale";

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

  if (!smsPhone) {
    return NextResponse.json(
      { error: "Неверный формат номера телефона" },
      { status: 400 }
    );
  }

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

  // ─── Основная логика регистрации ─────────────────────────────
  const cleanPhone = normalizePhone(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();

  // Валидируем поля ДО инвалидации SMS-кода — иначе код сгорает при неполной форме
  if (!name || !cleanPhone || !cleanEmail || !password) {
    return NextResponse.json(
      { error: "Заполните имя, телефон, email и пароль" },
      { status: 400 }
    );
  }

  // Помечаем код как использованный (только после успешной валидации полей)
  await prisma.smsCode.update({
    where: { id: smsRecord.id },
    data: { used: true },
  });

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

  // Determine effective priceType: 1C record overrides user selection if linked
  const effectivePriceType = oneCCustomer?.priceType || priceType;

  // Auto-approve retail/discount customers; wholesale types need manager confirmation
  // Exception: always auto-approve if linked to 1C record
  const shouldAutoApprove = Boolean(oneCCustomer) || AUTO_APPROVE_TYPES.has(effectivePriceType);

  const customer = await prisma.customer.create({
    data: {
      name,
      phone: cleanPhone,
      email: cleanEmail,
      password: hashedPassword,

      oneCId: oneCCustomer?.oneCId || null,

      isApproved: shouldAutoApprove,
      isActive: true,

      manager: oneCCustomer?.manager || null,
      role: "customer",
      priceType: effectivePriceType,
    },
  });

  if (shouldAutoApprove) {
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
    autoLogin: shouldAutoApprove,
    oneCLinked: Boolean(oneCCustomer),

    message: shouldAutoApprove
      ? "Регистрация успешно завершена."
      : "Заявка отправлена на рассмотрение. Менеджер свяжется с вами для подтверждения того, что вы являетесь владельцем магазина или бизнеса.",
  });
}
