import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Props) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;

  const customer = await prisma.customer.update({
    where: { id: Number(id) },
    data: { isApproved: true },
    select: { id: true, name: true, email: true, companyName: true },
  });

  // Send approval email (fire-and-forget — don't block the response)
  if (customer.email) {
    const displayName = customer.companyName || customer.name || "Клиент";
    sendMail({
      to: customer.email,
      subject: "Ваш аккаунт одобрен — Косметичка",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
          <h2 style="margin:0 0 16px;font-size:22px;color:#1e293b">Добро пожаловать, ${displayName}!</h2>
          <p style="margin:0 0 12px;color:#475569;line-height:1.6">
            Ваш аккаунт в оптовом магазине <strong>Косметичка</strong> одобрен менеджером.
            Теперь вам доступны оптовые цены и оформление заказов.
          </p>
          <a href="https://kosmetichka-opt.ru/catalog"
             style="display:inline-block;margin:20px 0;padding:12px 28px;background:linear-gradient(135deg,#ec4899,#8b5cf6,#3b82f6);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none">
            Перейти в каталог
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
            Если вы не регистрировались на kosmetichka-opt.ru — просто проигнорируйте это письмо.
          </p>
        </div>
      `,
    }).catch(() => {}); // Don't fail the request if email fails
  }

  return NextResponse.json({ success: true });
}