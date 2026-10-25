import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { getClientIp } from "@/lib/rateLimit";
import { checkLoginAttempt, clearLoginAttempts } from "@/lib/loginAttempts";

// Same limits as the customer login (/api/auth/login), separate counter
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  const rateKey = `admin_${getClientIp(request)}`;

  if (!(await checkLoginAttempt(rateKey, MAX_ATTEMPTS, WINDOW_MS))) {
    return NextResponse.json(
      { error: "Слишком много попыток входа. Подождите 15 минут." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const login = typeof body?.login === "string" ? body.login : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!login || !password) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { login },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  await clearLoginAttempts(rateKey); // успешный вход — сбрасываем счётчик

  const token = await createToken({
    id: user.id,
    email: user.login,
    role: user.role,
  });

  const cookieStore = await cookies();

  cookieStore.set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ success: true, role: user.role });
}
