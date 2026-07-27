import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Укажите email" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find customer by email
    const customer = await prisma.customer.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true, email: true, name: true, companyName: true },
    });

    // Always return success to avoid email enumeration
    if (!customer || !customer.email) {
      return NextResponse.json({ success: true });
    }

    // Rate limit: 1 request per 60 seconds per email
    const recent = await prisma.passwordResetToken.findFirst({
      where: {
        email: normalizedEmail,
        createdAt: { gte: new Date(Date.now() - 60_000) },
        used: false,
      },
    });

    if (recent) {
      return NextResponse.json({ success: true }); // silent throttle
    }

    // Invalidate old tokens for this email
    await prisma.passwordResetToken.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    // Generate token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { email: normalizedEmail, token, expiresAt },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://kosmetichka-opt.ru";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    const displayName = customer.companyName || customer.name || normalizedEmail;

    await sendMail({
      to: customer.email,
      subject: "Сброс пароля — Косметичка B2B",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
          <h2 style="margin: 0 0 16px; font-size: 22px; color: #1e293b;">Сброс пароля</h2>
          <p style="margin: 0 0 8px; color: #475569;">Здравствуйте, ${displayName}!</p>
          <p style="margin: 0 0 24px; color: #475569;">
            Мы получили запрос на сброс пароля для вашего аккаунта в B2B-кабинете Косметички.
            Нажмите кнопку ниже, чтобы задать новый пароль.
          </p>
          <a href="${resetUrl}"
             style="display: inline-block; padding: 14px 32px; background: linear-gradient(90deg, #ec4899, #a855f7, #3b82f6);
                    color: #fff; font-weight: 700; text-decoration: none; border-radius: 16px; font-size: 15px;">
            Сбросить пароль
          </a>
          <p style="margin: 24px 0 0; color: #94a3b8; font-size: 13px;">
            Ссылка действительна 1 час. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.
          </p>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />
          <p style="margin: 0; color: #cbd5e1; font-size: 12px;">Косметичка-Опт · B2B Кабинет</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
