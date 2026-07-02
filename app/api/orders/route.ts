import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// ── Bitrix24 integration ──────────────────────────────────────────────────────

async function sendToBitrix(order: {
  id: number;
  total: number;
  comment: string | null;
  customer: { name: string; phone: string | null; email: string | null; companyName: string | null };
  items: { productName: string; barcode: string | null; quantity: number; price: number; total: number }[];
}) {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl) return;

  const itemLines = order.items
    .map((item) => `• ${item.productName} (${item.barcode || "—"}) × ${item.quantity} = ${item.total} ₽`)
    .join("\n");

  const comments = [
    `Клиент: ${order.customer.companyName || order.customer.name}`,
    `Телефон: ${order.customer.phone || "не указан"}`,
    `Email: ${order.customer.email}`,
    ``,
    `Состав заказа:`,
    itemLines,
    order.comment ? `\nКомментарий: ${order.comment}` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const body = {
    fields: {
      TITLE: `Заказ №${order.id} — ${order.customer.companyName || order.customer.name}`,
      OPPORTUNITY: order.total,
      CURRENCY_ID: "RUB",
      STAGE_ID: "NEW",
      SOURCE_ID: "WEB",
      COMMENTS: comments,
    },
  };

  try {
    const res = await fetch(`${webhookUrl}crm.deal.add.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      console.error("[Bitrix24] Ошибка создания сделки:", data.error, data.error_description);
    } else {
      console.log("[Bitrix24] Сделка создана, ID:", data.result);
    }
  } catch (err) {
    console.error("[Bitrix24] Не удалось отправить заказ:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const payload = await verifyToken(token);

  if (!payload?.id) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const { items, comment } = await request.json();

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Корзина пустая" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: Number(payload.id) },
  });

  if (!customer) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  const productIds: number[] = items.map((item: any) => Number(item.id));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { prices: true },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  let order;

  try {
    const orderItems = items.map((item: any) => {
      const product = productById.get(Number(item.id));

      if (!product) {
        throw new Error(`Товар ${item.id} не найден`);
      }

      const matchedPrice = product.prices.find(
        (p) => p.priceType === customer.priceType
      );
      const fallbackPrice = product.prices.find(
        (p) => p.priceType === "retail"
      );

      const price = Math.round(matchedPrice?.price ?? fallbackPrice?.price ?? 0);
      const quantity = Number(item.quantity) || 0;

      return {
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || null,
        quantity,
        price,
        total: price * quantity,
      };
    });

    let total = 0;
    for (const it of orderItems) total += it.total;

    order = await prisma.order.create({
      data: {
        customerId: Number(payload.id),
        status: "pending",
        total,
        comment: comment || null,
        items: {
          create: orderItems,
        },
      },
      include: { items: true },
    });

    // Отправляем в Битрикс24 асинхронно (не блокируем ответ)
    sendToBitrix({
      id: order.id,
      total: order.total,
      comment: order.comment,
      customer: {
        name: customer.name ?? "",
        phone: customer.phone ?? null,
        email: customer.email ?? "",
        companyName: customer.companyName ?? null,
      },
      items: order.items,
    }).catch((err) => console.error("[Bitrix24]", err));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
  });
}
