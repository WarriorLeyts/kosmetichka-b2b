import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

const VALID_ROLES = ["manager", "picker", "admin", "employee", "hr"];

export async function POST(request: Request) {
  // Staff accounts are managed by admins only (same as the /admin/users pages)
  if (!(await requireAdminRole())) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { name, login, password, role } = body ?? {};

  if (
    !name || !login || !password ||
    typeof name !== "string" || typeof login !== "string" || typeof password !== "string"
  ) {
    return NextResponse.json(
      { error: "Заполните имя, логин и пароль" },
      { status: 400 }
    );
  }

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "Недопустимая роль. Разрешено: manager, picker, admin" },
      { status: 400 }
    );
  }
  const safeRole = VALID_ROLES.includes(role) ? role : "manager";

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
