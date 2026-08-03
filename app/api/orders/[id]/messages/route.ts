import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { messageLimiter } from "@/lib/rateLimit";

async function getCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  return { id: payload.id as number };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== customer.id) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  const msgs = await prisma.orderMessage.findMany({
    where: { orderId, source: "customer" },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, userId: true, createdAt: true },
  });

  return NextResponse.json({
    messages: msgs.map((m) => ({
      id: m.id,
      text: m.text,
      isFromManager: m.userId !== null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const orderId = Number(id);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== customer.id) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }

  const { text } = await request.json();
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Сообщение слишком длинное" }, { status: 400 });
  }

  // Rate limit: max 30 messages per customer per 10 minutes
  const rlResult = messageLimiter.check(`msg:${customer.id}`);
  if (!rlResult.ok) {
    return NextResponse.json(
      { error: "Слишком много сообщений. Подождите немного." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rlResult.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const msg = await prisma.orderMessage.create({
    data: {
      orderId,
      text: text.trim(),
      source: "customer",
      // userId stays null — this is a customer message, not staff
    },
  });

  return NextResponse.json({
    message: {
      id: msg.id,
      text: msg.text,
      isFromManager: false,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
