import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

/** Escape user-supplied strings before embedding in HTML emails */
function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

      const rawPrice = matchedPrice?.price ?? fallbackPrice?.price;
      if (!rawPrice || rawPrice <= 0) {
        throw new Error(`Цена для товара «${product.name}» не найдена. Обратитесь к менеджеру.`);
      }
      const price = Math.round(rawPrice);
      const quantity = Number(item.quantity) || 0;

      // MOQ check
      const minQty = (product as any).minOrderQty ?? 1;
      if (quantity < minQty) {
        throw new Error(`Минимальное количество для «${product.name}» — ${minQty} шт.`);
      }

      return {
        productId: product.id,
        productName: product.name,
        barcode: product.barcode || null,
        quantity,
        price,
        total: price * quantity,
        variantName: item.variantName ?? null,
        variantImageUrl: item.variantImageUrl ?? null,
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
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 400 });
  }

  // Уведомление покупателю о принятом заказе
  if (customer.email) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://kosmetichka-opt.ru";
    const itemsHtml = order.items
      ? (await prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } }))
          .map(
            (it: any) =>
              `<tr>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(it.productName)}${it.variantName ? ` <span style="color:#6366f1;">(${escHtml(it.variantName)})</span>` : ""}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.quantity}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${it.total.toLocaleString("ru-RU")} ₽</td>
              </tr>`
          )
          .join("")
      : "";

    sendMail({
      to: customer.email,
      subject: `Ваш заказ #${order.id} принят — Косметичка`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#1e293b;">✅ Заказ #${order.id} принят!</h2>
          <p style="color:#475569;margin:0 0 20px;">Спасибо! Менеджер свяжется с вами в ближайшее время.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:8px;text-align:left;color:#64748b;font-weight:600;">Товар</th>
                <th style="padding:8px;text-align:center;color:#64748b;font-weight:600;">Кол-во</th>
                <th style="padding:8px;text-align:right;color:#64748b;font-weight:600;">Сумма</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div style="border-top:2px solid #1e293b;padding-top:12px;text-align:right;">
            <strong style="font-size:16px;color:#1e293b;">Итого: ${order.total.toLocaleString("ru-RU")} ₽</strong>
          </div>
          <div style="margin-top:24px;">
            <a href="${baseUrl}/orders/${order.id}/invoice"
               style="display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;font-weight:700;text-decoration:none;border-radius:12px;font-size:14px;">
              Скачать счёт
            </a>
          </div>
          <p style="margin-top:20px;font-size:12px;color:#94a3b8;">kosmetichka-opt.ru</p>
        </div>`,
    }).catch(console.error);
  }

  // Уведомление администратору о новом заказе
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const clientName = escHtml(
      customer.companyName || customer.name || customer.phone || `#${customer.id}`
    );
    const clientPhone = customer.phone ? escHtml(customer.phone) : null;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://kosmetichka-opt.ru";
    sendMail({
      to: adminEmail,
      subject: `Новый заказ #${order.id} — ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#1e293b;">🛍️ Новый заказ #${order.id}</h2>
          <p style="margin:0 0 8px;color:#475569;"><b>Клиент:</b> ${clientName}</p>
          ${clientPhone ? `<p style="margin:0 0 8px;color:#475569;"><b>Телефон:</b> ${clientPhone}</p>` : ""}
          <p style="margin:0 0 24px;color:#475569;"><b>Сумма:</b> ${order.total} ₽</p>
          <a href="${baseUrl}/admin/orders/${order.id}"
             style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-weight:700;text-decoration:none;border-radius:12px;">
            Открыть заказ
          </a>
        </div>
      `,
    }).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
  });
}
