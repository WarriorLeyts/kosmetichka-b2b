import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Битрикс24 вызывает этот endpoint когда сделка переходит в стадию "Оплачен"
// Настройка: CRM → Автоматизация → стадия "Оплачен" → добавить Робот "Вебхук"
// URL: https://kosmetichka-opt.ru/api/bitrix/webhook?secret=ВАШ_СЕКРЕТ
// Параметры: order_id={=Document:XML_ID}

export async function POST(request: NextRequest) {
  // Проверка секретного токена
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.BITRIX_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orderId: number | null = null;

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const json = await request.json();
      orderId = Number(json.order_id || json.XML_ID);
    } else {
      // form-encoded (Битрикс обычно шлёт так)
      const text = await request.text();
      const params = new URLSearchParams(text);
      orderId = Number(params.get("order_id") || params.get("XML_ID"));
    }
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!orderId || isNaN(orderId)) {
    return NextResponse.json({ error: "order_id не передан" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) {
    return NextResponse.json({ error: `Заказ №${orderId} не найден` }, { status: 404 });
  }

  if (order.status === "approved") {
    return NextResponse.json({ ok: true, message: "Уже подтверждён" });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "approved" },
  });

  console.log(`[Bitrix webhook] Заказ №${orderId} → approved`);

  return NextResponse.json({ ok: true, orderId, status: "approved" });
}
