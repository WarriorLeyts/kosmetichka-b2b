import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import fs from "fs";
import path from "path";

// ── Bitrix24 helpers ──────────────────────────────────────────────────────────

async function bitrixCall(webhookUrl: string, method: string, body: object): Promise<any> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Find or create contact, return Bitrix contact ID
async function findOrCreateContact(
  webhookUrl: string,
  customer: { name: string; phone: string | null; email: string | null; companyName: string | null }
): Promise<number | null> {
  if (customer.phone) {
    const r = await bitrixCall(webhookUrl, "crm.contact.list", {
      filter: { PHONE: customer.phone },
      select: ["ID"],
    });
    if (r.result?.length > 0) return Number(r.result[0].ID);
  }
  if (customer.email) {
    const r = await bitrixCall(webhookUrl, "crm.contact.list", {
      filter: { EMAIL: customer.email },
      select: ["ID"],
    });
    if (r.result?.length > 0) return Number(r.result[0].ID);
  }

  const parts = (customer.name || "").trim().split(" ");
  const fields: any = {
    LAST_NAME: parts[0] || "",
    NAME: parts[1] || "",
    SECOND_NAME: parts[2] || "",
    SOURCE_ID: "WEB",
  };
  if (customer.companyName) fields.COMPANY_TITLE = customer.companyName;
  if (customer.phone) fields.PHONE = [{ VALUE: customer.phone, VALUE_TYPE: "WORK" }];
  if (customer.email) fields.EMAIL = [{ VALUE: customer.email, VALUE_TYPE: "WORK" }];

  const r = await bitrixCall(webhookUrl, "crm.contact.add", { fields });
  if (r.result) {
    console.log("[Bitrix24] Контакт создан:", r.result);
    return Number(r.result);
  }
  console.error("[Bitrix24] Ошибка создания контакта:", r);
  return null;
}

// Read image from local filesystem and return base64
function imageToBase64(imagePath: string): { name: string; data: string } | null {
  try {
    const fullPath = path.join(process.cwd(), "data", "1c", imagePath);
    if (!fs.existsSync(fullPath)) return null;
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(imagePath).toLowerCase().replace(".", "") || "jpg";
    return { name: `product.${ext}`, data: buffer.toString("base64") };
  } catch {
    return null;
  }
}

// Find existing Bitrix product by barcode (XML_ID), or create it with image
async function findOrCreateProduct(
  webhookUrl: string,
  item: { productName: string; barcode: string | null; price: number; imagePath: string | null }
): Promise<number | null> {
  // Search by barcode
  if (item.barcode) {
    const r = await bitrixCall(webhookUrl, "crm.product.list", {
      filter: { XML_ID: item.barcode },
      select: ["ID"],
    });
    if (r.result?.length > 0) return Number(r.result[0].ID);
  }

  // Build product fields
  const fields: any = {
    NAME: item.productName,
    PRICE: item.price,
    CURRENCY_ID: "RUB",
  };
  if (item.barcode) fields.XML_ID = item.barcode;

  // Attach image
  if (item.imagePath) {
    const img = imageToBase64(item.imagePath);
    if (img) {
      fields.PREVIEW_PICTURE = { fileData: [img.name, img.data] };
    }
  }

  const r = await bitrixCall(webhookUrl, "crm.product.add", { fields });
  if (r.result) {
    console.log("[Bitrix24] Товар создан в каталоге:", r.result, item.productName);
    return Number(r.result);
  }
  console.error("[Bitrix24] Ошибка создания товара:", r, item.productName);
  return null;
}

// Main integration function
async function sendToBitrix(order: {
  id: number;
  total: number;
  comment: string | null;
  customer: { name: string; phone: string | null; email: string | null; companyName: string | null };
  items: { productName: string; barcode: string | null; quantity: number; price: number; total: number; imagePath: string | null }[];
}) {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[Bitrix24] BITRIX_WEBHOOK_URL не задан");
    return;
  }

  try {
    // 1. Найти / создать контакт
    const contactId = await findOrCreateContact(webhookUrl, order.customer);

    // 2. Создать сделку
    const dealFields: any = {
      TITLE: `Заказ №${order.id} — ${order.customer.companyName || order.customer.name}`,
      OPPORTUNITY: order.total,
      CURRENCY_ID: "RUB",
      STAGE_ID: "NEW",
      SOURCE_ID: "WEB",
    };
    if (order.comment) dealFields.COMMENTS = order.comment;
    if (contactId) dealFields.CONTACT_ID = contactId;

    const dealRes = await bitrixCall(webhookUrl, "crm.deal.add", { fields: dealFields });
    if (!dealRes.result) {
      console.error("[Bitrix24] Ошибка создания сделки:", dealRes);
      return;
    }
    const dealId = dealRes.result;
    console.log("[Bitrix24] Сделка создана:", dealId);

    // 3. Найти / создать товары в каталоге и добавить в сделку
    const productRows = await Promise.all(
      order.items.map(async (item) => {
        const bitrixProductId = await findOrCreateProduct(webhookUrl, item);
        const row: any = {
          PRODUCT_NAME: item.productName,
          PRICE: item.price,
          QUANTITY: item.quantity,
          DISCOUNT_SUM: 0,
          TAX_RATE: 0,
        };
        if (bitrixProductId) row.PRODUCT_ID = bitrixProductId;
        return row;
      })
    );

    const rowsRes = await bitrixCall(webhookUrl, "crm.deal.productrows.set", {
      id: dealId,
      rows: productRows,
    });

    if (rowsRes.result) {
      console.log("[Bitrix24] Товары добавлены в сделку:", dealId);
    } else {
      console.error("[Bitrix24] Ошибка добавления товаров:", rowsRes);
    }
  } catch (err) {
    console.error("[Bitrix24] Ошибка интеграции:", err);
  }
}

// ── Order API handler ─────────────────────────────────────────────────────────

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
    include: { prices: true, images: true },
  });

  const productById = new Map(products.map((p) => [p.id, p]));

  let order;

  try {
    const orderItems = items.map((item: any) => {
      const product = productById.get(Number(item.id));
      if (!product) throw new Error(`Товар ${item.id} не найден`);

      const matchedPrice = product.prices.find((p) => p.priceType === customer.priceType);
      const fallbackPrice = product.prices.find((p) => p.priceType === "retail");
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
        items: { create: orderItems },
      },
      include: { items: true },
    });

    // Обогащаем позиции путями к изображениям для Битрикса
    const bitrixItems = order.items.map((item) => {
      const product = productById.get(item.productId);
      return {
        productName: item.productName,
        barcode: item.barcode,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        imagePath: product?.images?.[0]?.path ?? null,
      };
    });

    sendToBitrix({
      id: order.id,
      total: order.total,
      comment: order.comment,
      customer: {
        name: customer.name ?? "",
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        companyName: customer.companyName ?? null,
      },
      items: bitrixItems,
    }).catch((err) => console.error("[Bitrix24]", err));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 400 });
  }

  return NextResponse.json({ success: true, orderId: order.id });
}
