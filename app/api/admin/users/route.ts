import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { name, login, password, role } = await request.json();

  if (!name || !login || !password) {
    return NextResponse.json(
      { error: "Заполните имя, логин и пароль" },
      { status: 400 }
    );
  }

  const VALID_ROLES = ["manager", "picker", "admin"];
  const safeRole = VALID_ROLES.includes(role) ? role : "manager";
  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "Недопустимая роль. Разрешено: manager, picker, admin" },
      { status: 400 }
    );
  }

  const exists = await prisma.user.findUnique({
    where: { login },
  });

  if (exists) {
    return NextResponse.json(
      { error: "Пользователь с таким логином уже есть" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name,
      login,
      password: hashedPassword,
      role: safeRole,
    },
  });

  return NextResponse.json({ success: true });
}