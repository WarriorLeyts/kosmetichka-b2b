import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { prisma } from "@/lib/prisma";
import { messageLimiter } from "@/lib/rateLimit";
import { notifyStaffLater } from "@/lib/staffNotify";
import { buildProductRequest, PRODUCT_REQUEST_STATUSES } from "@/lib/productRequest";

async function getCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyCustomerToken(token);
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

  const body = (await request.json().catch(() => ({}))) as { text?: unknown; productRequest?: { productId: unknown; quantity: unknown; variantName?: unknown } };

  // «Добавить товар»: a product card for the manager, built on the server from the product id
  let text = body.text;
  if (body.productRequest) {
    if (!PRODUCT_REQUEST_STATUSES.includes(order.status)) {
      return NextResponse.json({ error: "Заказ уже оформлен — добавить товар нельзя. Оформите новый заказ." }, { status: 400 });
    }
    const who = await prisma.customer.findUnique({ where: { id: customer.id }, select: { priceType: true } });
    const card = await buildProductRequest(who ?? {}, body.productRequest);
    if ("error" in card) return NextResponse.json({ error: card.error }, { status: 400 });
    text = JSON.stringify(card);
  } else if (typeof text === "string" && text.trim().startsWith("{") && /"_t"\s*:\s*"product-request"/.test(text)) {
    // only the server writes these cards
    return NextResponse.json({ error: "Неверное сообщение" }, { status: 400 });
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }
  if (text.length > (body.productRequest ? 4000 : 2000)) {
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
  notifyStaffLater({ kind: "chat", orderId, text: msg.text });

  return NextResponse.json({
    message: {
      id: msg.id,
      text: msg.text,
      isFromManager: false,
      createdAt: msg.createdAt.toISOString(),
    },
  });
}
