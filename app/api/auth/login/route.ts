import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { getClientIp } from "@/lib/rateLimit";
import { checkLoginAttempt, clearLoginAttempts } from "@/lib/loginAttempts";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const checkRateLimit = (ip: string) => checkLoginAttempt(ip, MAX_ATTEMPTS, WINDOW_MS);
const clearAttempts = (ip: string) => clearLoginAttempts(ip);

export async function POST(request: Request) {
  const ip = getClientIp(request);

  if (!(await checkRateLimit(ip))) {
    return NextResponse.json(
      { error: "Слишком много попыток входа. Подождите 15 минут." },
      { status: 429 }
    );
  }

  const { email, password } = await request.json();

  const customer = await prisma.customer.findFirst({
  where: {
    OR: [
      { email },
      { phone: email },
    ],
  },
});
 
  if (!customer) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const isValid = await bcrypt.compare(password, customer.password);

  if (!isValid) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  if (!customer.isApproved) {
    return NextResponse.json(
      { error: "Ваш аккаунт ещё не подтверждён администратором" },
      { status: 403 }
    );
  }

  if (!customer.isActive) {
    return NextResponse.json(
      { error: "Ваш аккаунт заблокирован" },
      { status: 403 }
    );
  }

  await clearAttempts(ip); // успешный вход — сбрасываем счётчик

const token = await createToken({
  id: customer.id,
  email: customer.email ?? customer.phone ?? String(customer.id),
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

  return NextResponse.json({
    success: true,
  });
}