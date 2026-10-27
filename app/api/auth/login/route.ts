import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { getClientIp } from "@/lib/rateLimit";
import { checkLoginLimits, clearLoginLimits } from "@/lib/loginAttempts";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = await request.json().catch(() => null);
  // Только строки: объект в email Prisma восприняла бы как фильтр ({ not: "" } и т. п.)
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 120) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";

  if (!(await checkLoginLimits("login", ip, email, WINDOW_MS))) {
    return NextResponse.json(
      { error: "Слишком много попыток входа. Подождите 15 минут." },
      { status: 429 }
    );
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

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

  await clearLoginLimits("login", ip, email); // успешный вход — сбрасываем счётчики этого IP и аккаунта

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