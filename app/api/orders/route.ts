import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// ── Bitrix24 integration ──────────────────────────────────────────────────────

async function bitrixCall(webhookUrl: string, method: string, fields: object): Promise<any> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return res.json();
}

async function findOrCreateContact(
  webhookUrl: string,
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    companyName: string | null;
  }
): Promise<number | null> {
  // Search by phone first
  if (customer.phone) {
    const searchRes = await bitrixCall(webhookUrl, "crm.contact.list", {
      filter: { PHONE: customer.phone },
      select: ["ID"],
    });
    if (searchRes.result?.length > 0) {
      return Number(searchRes.result[0].ID);
    }
  }

  // Search by email
  if (customer.email) {
    const searchRes = await bitrixCall(webhookUrl, "crm.contact.list", {
      filter: { EMAIL: customer.email },
      select: ["ID"],
    });
    if (searchRes.result?.length > 0) {
      return Number(searchRes.result[0].ID);
    }
  }

  // Create new contact
  const nameParts = (customer.name || "").trim().split(" ");
  const lastName = nameParts[0] || "";
  const firstName = nameParts[1] || "";
  const middleName = nameParts[2] || "";

  const contactFields: any = {
    NAME: firstName,
    LAST_NAME: lastName,
    SECOND_NAME: middleName,
    SOURCE_ID: "WEB",
  };

  if (customer.companyName) {
    contactFields.COMPANY_TITLE = customer.companyName;
  }

  if (customer.phone) {
    contactFields.PHONE = [{ VALUE: customer.phone, VALUE_TYPE: "WORK" }];
  }

  if (customer.email) {
    contactFields.EMAIL = [{ VALUE: customer.email, VALUE_TYPE: "WORK" }];
  }

  const createRes = await bitrixCall(webhookUrl, "crm.contact.add", {
    fields: contactFields,
  });

  if (createRes.result) {
    console.log("[Bitrix24] Контакт создан, ID:", createRes.result);
    return Number(createRes.result);
  }

  console.error("[Bitrix24] Не удалось создать контакт:", createRes);
  return null;
}

async function sendToBitrix(order: {
  id: number;
  total: number;
  comment: string | null;
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    companyName: string | null;
  };
  items: {
    productName: string;
    barcode: string | null;
    quantity: number;
    price: number;
    total: number;
  }[];
}) {
  const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[Bitrix24] BITRIX_WEBHOOK_URL не задан");
    return;
  }

  try {
    // 1. Найти или создать контакт
    const contactId = await findOrCreateContact(webhookUrl, order.customer);

    // 2. Создать сделку
    const dealFields: any = {
      TITLE: `Заказ №${order.id} — ${order.customer.companyName || order.customer.name}`,
      OPPORTUNITY: order.total,
      CURRENCY_ID: "RUB",
      STAGE_ID: "NEW",
      SOURCE_ID: "WEB",
    };

    if (order.comment) {
      dealFields.COMMENTS = order.comment;
    }

    if (contactId) {
      dealFields.CONTACT_ID = contactId;
    }

    const dealRes = await bitrixCall(webhookUrl, "crm.deal.add", { fields: dealFields });

    if (!dealRes.result) {
      console.error("[Bitrix24] Ошибка создания сделки:", dealRes);
      return;
    }

    const dealId = dealRes.result;
    console.log("[Bitrix24] Сделка создана, ID:", dealId);

    // 3. Добавить товары в сделку
    const productRows = order.items.map((item) => ({
      PRODUCT_NAME: item.barcode
        ? `${item.productName} (${item.barcode})`
        : item.productName,
      PRICE: item.price,
      QUANTITY: item.quantity,
      DISCOUNT_SUM: 0,
      TAX_RATE: 0,
    }));

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
        items: { create: orderItems },
      },
      include: { items: true },
    });

    // Отправляем в Битрикс24 асинхронно
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
      items: order.items,
    }).catch((err) => console.error("[Bitrix24]", err));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 400 });
  }

  return NextResponse.json({ success: true, orderId: order.id });
}
