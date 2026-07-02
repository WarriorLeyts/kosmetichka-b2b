import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Битрикс24 вызывает этот endpoint когда сделка переходит в стадию "Оплачен"
// Настройка: CRM → Автоматизация → стадия "Оплачен" → Робот "Вебхук"
// URL: https://kosmetichka-opt.ru/api/bitrix/webhook?secret=ВАШ_СЕКРЕТ
// Параметры:
//   order_id = {=Document:XML_ID}
//   deal_id  = {=Document:ID}

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
      const sp = new URLSearchParams(text);
      sp.forEach((v, k) => { params[k] = v; });
    }

    orderId = Number(params.order_id || params.XML_ID) || null;
    dealId  = Number(params.deal_id  || params.ID)     || null;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "order_id не передан" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ error: `Заказ №${orderId} не найден` }, { status: 404 });
  }

  // ── Синхронизация товаров из Битрикса ──────────────────────────────────────
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;

  if (webhookUrl && dealId) {
    try {
      // Получить строки товаров из сделки
      const rowsRes = await bitrixGet(webhookUrl, "crm.deal.productrows.get", { id: dealId });
      const rows: any[] = rowsRes.result || [];

      if (rows.length > 0) {
        // Сопоставляем по штрихкоду (в названии) или по порядку
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

        // Обновить итог заказа
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
