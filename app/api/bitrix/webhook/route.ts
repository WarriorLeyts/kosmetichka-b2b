import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Битрикс24 вызывает этот endpoint когда сделка переходит в стадию "Оплачен"
// Настройка: CRM → Автоматизация → стадия "Оплачен" → Робот "Вебхук"
// URL: https://kosmetichka-opt.ru/api/bitrix/webhook?secret=ВАШ_СЕКРЕТ
// Параметры:
//   order_id = {=Document:XML_ID}   (может быть пустым — тогда ищем через deal_id)
//   deal_id  = {=Document:ID}

async function bitrixGet(webhookUrl: string, method: string, params: Record<string, any>) {
  const url = new URL(`${webhookUrl}${method}.json`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  const res = await fetch(url.toString());
  return res.json();
}

async function bitrixPost(webhookUrl: string, method: string, body: object): Promise<any> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

    // Read from POST body first, then fall back to URL query params
    const qOrderId = request.nextUrl.searchParams.get("order_id");
    const qDealId  = request.nextUrl.searchParams.get("deal_id");

    orderId = Number(params.order_id || params.XML_ID || qOrderId) || null;
    dealId  = Number(params.deal_id  || params.ID     || qDealId)  || null;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;

  // If we have a dealId but no orderId — look it up via Bitrix deal XML_ID / TITLE
  if (!orderId && dealId && webhookUrl) {
    try {
      const dealRes = await bitrixGet(webhookUrl, "crm.deal.get", { id: dealId });
      const deal = dealRes.result;
      if (deal?.XML_ID) orderId = Number(deal.XML_ID) || null;
      if (!orderId && deal?.TITLE) {
        const match = deal.TITLE.match(/№(\d+)/);
        if (match) orderId = Number(match[1]) || null;
      }
    } catch {
      // Bitrix call failed
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
        // Match order items by barcode (from name) OR by exact product name (fallback)
        const orderItemsByBarcode = new Map(
          order.items.filter((i) => i.barcode).map((item) => [item.barcode!, item])
        );
        const orderItemsByName = new Map(
          order.items.map((item) => [item.productName.trim().toLowerCase(), item])
        );
        const updatedIds = new Set<number>();

        let newTotal = 0;

        for (const row of rows) {
          const rowName   = String(row.PRODUCT_NAME || "").trim();
          const price     = Math.round(Number(row.PRICE)    || 0);
          const quantity  = Math.round(Number(row.QUANTITY) || 1);
          const barcode   = extractBarcode(rowName);
          // Name without barcode suffix, lowercased for matching
          const cleanName = rowName.replace(/\s*\(\d{8,14}\)\s*$/, "").trim().toLowerCase();

          const orderItem =
            (barcode ? orderItemsByBarcode.get(barcode) : null) ??
            orderItemsByName.get(cleanName) ??
            orderItemsByName.get(rowName.toLowerCase()) ??
            null;

          if (!orderItem || updatedIds.has(orderItem.id)) continue;
          updatedIds.add(orderItem.id);

          if (price > 0 && quantity > 0) {
            await prisma.orderItem.update({
              where: { id: orderItem.id },
              data: { price, quantity, total: price * quantity },
            });
            newTotal += price * quantity;
          } else {
            newTotal += orderItem.price * orderItem.quantity;
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
    }
  }

  // ── Обновить статус и сохранить dealId ────────────────────────────────────
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "approved",
      // Cache the Bitrix deal ID so the chat can post/fetch comments without re-searching
      ...(dealId ? { bitrixDealId: dealId } : {}),
    },
  });

  // Удаляем переписку — заказ подтверждён, чат больше не нужен
  await prisma.orderMessage.deleteMany({ where: { orderId } }).catch(() => {});

  console.log(`[Bitrix webhook] Заказ №${orderId} → approved${dealId ? ` (deal ${dealId})` : ""}, чат очищен`);

  return NextResponse.json({ ok: true, orderId, status: "approved" });
}
