import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * DB-based rate limiter — survives server restarts and multi-instance deploys.
 * Returns false if the IP has exceeded the attempt limit within the window.
 */
async function checkRateLimit(ip: string): Promise<boolean> {
  const now = new Date();

  const existing = await prisma.loginAttempt.findUnique({ where: { ip } });

  if (!existing || existing.resetAt < now) {
    // First attempt or window expired — start a fresh window
    await prisma.loginAttempt.upsert({
      where: { ip },
      update: { count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) },
      create: { ip, count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) },
    });
    return true;
  }

  if (existing.count >= MAX_ATTEMPTS) return false;

  await prisma.loginAttempt.update({
    where: { ip },
    data: { count: { increment: 1 } },
  });
  return true;
}

async function clearAttempts(ip: string) {
  await prisma.loginAttempt.deleteMany({ where: { ip } }).catch(() => {});
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

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