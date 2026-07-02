import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Битрикс24 вызывает этот endpoint когда сделка переходит в стадию "Оплачен"
// Настройка: CRM → Сделки → Роботы → стадия "Оплачен" → Робот "Исходящий Вебхук"
// URL: https://kosmetichka-opt.ru/api/bitrix/webhook?secret=ВАШ_СЕКРЕТ&deal_id={=Document:ID}

async function bitrixGet(webhookUrl: string, method: string, params: Record<string, any>) {
  const url = new URL(`${webhookUrl}${method}.json`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  const res = await fetch(url.toString());
  return res.json();
}

// Извлечь штрихкод из названия товара вида "Название товара (штрихкод)"
function extractBarcode(productName: string): string | null {
  const match = productName.match(/\((\d{8,14})\)\s*$/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  // Проверка секретного токена
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.BITRIX_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orderId: number | null = null;
  let dealId: number | null = null;

  try {
    const contentType = request.headers.get("content-type") || "";
    let params: Record<string, string> = {};

    if (contentType.includes("application/json")) {
      params = await request.json();
    } else {
      const text = await request.text();
      if (text) {
        const sp = new URLSearchParams(text);
        sp.forEach((v, k) => { params[k] = v; });
      }
    }

    // Читаем из тела ИЛИ из URL-параметров
    const qOrderId = request.nextUrl.searchParams.get("order_id");
    const qDealId  = request.nextUrl.searchParams.get("deal_id");

    orderId = Number(params.order_id || params.XML_ID || qOrderId) || null;
    dealId  = Number(params.deal_id  || params.ID     || qDealId)  || null;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;

  // Если order_id не передан — получаем из сделки в Битриксе (XML_ID или из заголовка "Заказ №13 — ...")
  if (!orderId && dealId && webhookUrl) {
    try {
      const dealRes = await bitrixGet(webhookUrl, "crm.deal.get", { id: dealId });
      const deal = dealRes.result;
      // Сначала пробуем XML_ID
      if (deal?.XML_ID) {
        orderId = Number(deal.XML_ID) || null;
      }
      // Запасной вариант: парсим из заголовка "Заказ №13 — Косметичка"
      if (!orderId && deal?.TITLE) {
        const match = deal.TITLE.match(/№(\d+)/);
        if (match) orderId = Number(match[1]) || null;
      }
      console.log(`[Bitrix webhook] dealId=${dealId} XML_ID=${deal?.XML_ID} TITLE=${deal?.TITLE} → orderId=${orderId}`);
    } catch (err) {
      console.error("[Bitrix webhook] Не удалось получить сделку:", err);
    }
  }

  if (!orderId) {
    return NextResponse.json({ error: "order_id не определён" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ error: `Заказ №${orderId} не найден` }, { status: 404 });
  }

  // ── Синхронизация товаров из Битрикса ──────────────────────────────────────
  if (webhookUrl && dealId) {
    try {
      const rowsRes = await bitrixGet(webhookUrl, "crm.deal.productrows.get", { id: dealId });
      const rows: any[] = rowsRes.result || [];

      if (rows.length > 0) {
        const orderItemsByBarcode = new Map(
          order.items.map((item) => [item.barcode, item])
        );

        let newTotal = 0;

        for (const row of rows) {
          const price    = Math.round(Number(row.PRICE)    || 0);
          const quantity = Math.round(Number(row.QUANTITY) || 1);
          const barcode  = extractBarcode(row.PRODUCT_NAME);

          const orderItem = barcode
            ? (orderItemsByBarcode.get(barcode) ?? null)
            : null;

          if (orderItem) {
            await prisma.orderItem.update({
              where: { id: orderItem.id },
              data: {
                price,
                quantity,
                total: price * quantity,
              },
            });
            newTotal += price * quantity;
          }
        }

        if (newTotal > 0) {
          await prisma.order.update({
            where: { id: orderId },
            data: { total: newTotal },
          });
          console.log(`[Bitrix webhook] Заказ №${orderId} — товары обновлены, итог: ${newTotal} ₽`);
        }
      }
    } catch (err) {
      console.error("[Bitrix webhook] Ошибка синхронизации товаров:", err);
      // Не прерываем — статус всё равно обновим
    }
  }

  // ── Обновить статус заказа ─────────────────────────────────────────────────
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "approved" },
  });

  console.log(`[Bitrix webhook] Заказ №${orderId} → approved`);

  return NextResponse.json({ ok: true, orderId, status: "approved" });
}
