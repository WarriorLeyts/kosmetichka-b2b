import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { getClientIp } from "@/lib/rateLimit";
import { checkLoginAttempt } from "@/lib/loginAttempts";
import { EMPLOYEE_ROLE } from "@/lib/academy";
import { checkRegistration } from "@/lib/academy-register";

// Не больше 5 регистраций с одного адреса в час (тот же счётчик в БД, что у входа)
const MAX_PER_IP = 5;
const WINDOW_MS = 60 * 60 * 1000;

async function verifySmartCaptcha(token: string): Promise<boolean> {
  const serverKey = process.env.SMARTCAPTCHA_SERVER_KEY;
  if (!serverKey) {
    console.error("[academy/register] SMARTCAPTCHA_SERVER_KEY не задан");
    return false;
  }
  try {
    const url = new URL("https://smartcaptcha.yandexcloud.net/validate");
    url.searchParams.set("secret", serverKey);
    url.searchParams.set("token", token);
    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json();
    return data.status === "ok";
  } catch (err) {
    console.error("[academy/register] ошибка проверки SmartCaptcha:", err);
    return false;
  }
}

/**
 * Самостоятельная регистрация сотрудника для тестов.
 * Роль всегда EMPLOYEE_ROLE («только тесты»): админку, заказы и API сборщиков она не открывает —
 * там пускают только admin/manager/picker. Повысить роль может администратор в /admin/users.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const check = checkRegistration(body);
  if (!check.ok) return NextResponse.json({ error: check.error, field: check.field }, { status: 400 });

  const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken : "";
  if (!captchaToken || !(await verifySmartCaptcha(captchaToken))) {
    return NextResponse.json({ error: "Проверка «я не робот» не пройдена. Попробуйте ещё раз.", field: "captcha" }, { status: 400 });
  }

  const ip = getClientIp(request);
  if (!(await checkLoginAttempt(`academy_reg_${ip}`, MAX_PER_IP, WINDOW_MS))) {
    return NextResponse.json({ error: "Слишком много регистраций. Попробуйте через час." }, { status: 429 });
  }

  const { name, login, password } = check.data;
  const exists = await prisma.user.findUnique({ where: { login }, select: { id: true } });
  if (exists) return NextResponse.json({ error: "Такой логин уже занят", field: "login" }, { status: 409 });

  let user;
  try {
    user = await prisma.user.create({
      data: { name, login, role: EMPLOYEE_ROLE, password: await bcrypt.hash(password, 10) },
    });
  } catch {
    // гонка двух одинаковых регистраций — уникальный индекс по login
    return NextResponse.json({ error: "Такой логин уже занят", field: "login" }, { status: 409 });
  }

  // Сразу входим — как /api/admin/login
  const token = await createToken({ id: user.id, email: user.login, role: user.role });
  (await cookies()).set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ success: true });
}
