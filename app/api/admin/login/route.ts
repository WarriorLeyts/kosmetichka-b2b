import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";
import { getClientIp } from "@/lib/rateLimit";
import { checkLoginLimits, clearLoginLimits } from "@/lib/loginAttempts";

// Same limits as the customer login (/api/auth/login), separate counters (see checkLoginLimits)
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = await request.json().catch(() => null);
  const login = typeof body?.login === "string" ? body.login.slice(0, 64) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";

  if (!(await checkLoginLimits("admin", ip, login, WINDOW_MS))) {
    return NextResponse.json(
      { error: "Слишком много попыток входа. Подождите 15 минут." },
      { status: 429 }
    );
  }

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

  await clearLoginLimits("admin", ip, login); // успешный вход — сбрасываем счётчики этого IP и аккаунта

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
