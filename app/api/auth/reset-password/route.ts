import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { token, password, passwordConfirm } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Неверная или истёкшая ссылка" }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен содержать не менее 6 символов" },
        { status: 400 }
      );
    }

    if (password !== passwordConfirm) {
      return NextResponse.json({ error: "Пароли не совпадают" }, { status: 400 });
    }

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Ссылка недействительна или устарела. Запросите новую." },
        { status: 400 }
      );
    }

    // Find customer by email
    const customer = await prisma.customer.findFirst({
      where: { email: { equals: resetToken.email, mode: "insensitive" } },
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }

    const hashed = await hash(password, 10);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { password: hashed },
      }),
      prisma.passwordResetToken.update({
        where: { token },
        data: { used: true },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
