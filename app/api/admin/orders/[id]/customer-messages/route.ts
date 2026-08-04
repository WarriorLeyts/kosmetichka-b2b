import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;

  const msgs = await prisma.orderMessage.findMany({
    where: { orderId: Number(id), source: "customer" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      text: true,
      isFromPicker: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return NextResponse.json({
    messages: msgs.map((m) => ({
      id: m.id,
      text: m.text,
      isFromPicker: m.isFromPicker,
      userName: m.isFromPicker ? (m.user?.name ?? null) : null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const { text } = await request.json();
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  const [msg, senderUser] = await Promise.all([
    prisma.orderMessage.create({
      data: {
        orderId,
        text: text.trim(),
        source: "customer",
        isFromPicker: true,
        userId: user.id as number,
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id as number },
      select: { name: true },
    }),
  ]);

  // UX-2: Email notification to customer when manager replies
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { email: true, name: true, companyName: true } } },
  });

  const email = order?.customer?.email;
  if (email) {
    const clientName = order?.customer?.companyName || order?.customer?.name || "Клиент";
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://kosmetichka-opt.ru";

    // Humanise JSON card messages before embedding in email
    let displayText = text.trim();
    try {
      const parsed = JSON.parse(displayText);
      if (parsed?._t === "img") displayText = "📷 Менеджер прислал фото";
      else if (parsed?._t === "product")
        displayText = `📦 Менеджер добавил товар: ${parsed.name ?? ""}`;
      else if (parsed?._t === "product-problem")
        displayText = `⚠️ Проблема с товаром: ${parsed.name ?? ""}`;
    } catch {
      // not JSON — use plain text as-is
    }

    const escaped = displayText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    sendMail({
      to: email,
      subject: `Новое сообщение по заказу #${orderId} — Косметичка`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#1e293b;">💬 Новое сообщение от менеджера</h2>
          <p style="margin:0 0 8px;color:#475569;">Здравствуйте, ${clientName}!</p>
          <p style="margin:0 0 20px;color:#475569;">
            По заказу <b>#${orderId}</b> пришёл ответ менеджера:
          </p>
          <div style="background:#f8fafc;border-left:4px solid #6366f1;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <p style="margin:0;color:#1e293b;white-space:pre-wrap;">${escaped}</p>
          </div>
          <a href="${baseUrl}/orders/${orderId}"
             style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-weight:700;text-decoration:none;border-radius:12px;">
            Открыть чат
          </a>
          <p style="margin-top:20px;font-size:12px;color:#94a3b8;">kosmetichka-opt.ru</p>
        </div>
      `,
    }).catch(console.error);
  }

  return NextResponse.json({
    message: {
      id: msg.id,
      text: msg.text,
      isFromPicker: true,
      userName: senderUser?.name ?? null,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
