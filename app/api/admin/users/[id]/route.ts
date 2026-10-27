import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

const VALID_ROLES = ["manager", "picker", "admin", "employee"];

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const forbidden = () =>
  NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
const badId = () =>
  NextResponse.json({ error: "Неверный ID" }, { status: 400 });
const notFound = () =>
  NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

export async function PATCH(request: Request, { params }: Props) {
  // Staff accounts are managed by admins only (same as the /admin/users pages)
  if (!(await requireAdminRole())) return forbidden();

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return badId();

  const body = await request.json().catch(() => null);
  const { name, login, password, role } = body ?? {};

  if (
    (name !== undefined && name !== null && typeof name !== "string") ||
    (login !== undefined && login !== null && typeof login !== "string") ||
    (password !== undefined && password !== null && typeof password !== "string")
  ) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "Недопустимая роль. Разрешено: manager, picker, admin" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (name) data.name = name;
  if (login) {
    const taken = await prisma.user.findFirst({ where: { login, NOT: { id } }, select: { id: true } });
    if (taken) {
      return NextResponse.json(
        { error: "Пользователь с таким логином уже есть" },
        { status: 400 }
      );
    }
    data.login = login;
  }
  if (role) data.role = role;

  if (password) {
    data.password = await bcrypt.hash(password, 10);
  }

  await prisma.user.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Props) {
  if (!(await requireAdminRole())) return forbidden();

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return badId();

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound();

  await prisma.user.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
