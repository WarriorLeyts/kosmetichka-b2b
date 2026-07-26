import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: Props) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const { name, login, password, role } = await request.json();

  const data: any = {};

  if (name) data.name = name;
  if (login) data.login = login;
  if (role) data.role = role;

  if (password) {
    data.password = await bcrypt.hash(password, 10);
  }

  await prisma.user.update({
    where: { id: Number(id) },
    data,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Props) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.user.delete({
    where: { id: Number(id) },
  });

  return NextResponse.json({ success: true });
}