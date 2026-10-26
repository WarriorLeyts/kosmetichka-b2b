import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { sendMail } from "@/lib/mail";
import { orderCreationLimiter } from "@/lib/rateLimit";
import { priceOrderItems, type PricedLine } from "@/lib/orderPricing";
import { calcPromo, MaxmaError, setOrder, type PromoResult } from "@/lib/maxma";
import { PROMO_NOT_FOR_ITEMS } from "@/lib/promo";

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

  const payload = await verifyCustomerToken(token);

  if (!payload?.id) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  // Rate limit: max 10 orders per customer per hour
  const rlResult = orderCreationLimiter.check(`order:${payload.id}`);
  if (!rlResult.ok) {
    return NextResponse.json(
      { error: "Слишком много заказов. Попробуйте позже." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rlResult.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const { items, comment, promocode } = await request.json();

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Корзина пустая" }, { status: 400 });
  }

  if (items.length > 500) {
    return NextResponse.json({ error: "Слишком много позиций в заказе (максимум 500)" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: Number(payload.id) },
  });

  if (!customer) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  let order;
  let lines: PricedLine[];
  let promo: PromoResult | null = null;

  try {
    lines = await priceOrderItems(customer, items);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Не удалось создать заказ";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Promo code: MAXMA validates and calculates it again on the server-side prices
  const promoCode = typeof promocode === "string" ? promocode.trim().slice(0, 64) : "";
  if (promoCode) {
    try {
      promo = await calcPromo(lines, promoCode, customer.phone);
    } catch (e) {
      const status = e instanceof MaxmaError && e.status === 503 ? 503 : 502;
      return NextResponse.json(
        { error: "Промокод: сервис лояльности недоступен, попробуйте позже или оформите заказ без промокода" },
        { status }
      );
    }
    if (!promo.applied || promo.discount <= 0) {
      const reason = promo.applied ? PROMO_NOT_FOR_ITEMS : promo.error || "не применён";
      return NextResponse.json({ error: `Промокод: ${reason}` }, { status: 400 });
    }
  }

  try {
    const orderItems = lines.map(({ sku: _sku, ...line }, i) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
      ...line,
      ...(promo ? { discount: promo.lines[i] } : {}),
    }));

    let total = 0;
    for (const it of orderItems) total += it.total;
    if (promo) total -= promo.discount;

    order = await prisma.order.create({
      data: {
        customerId: Number(payload.id),
        status: "pending",
        total,
        comment: comment || null,
        ...(promo ? { promoCode, discount: promo.discount } : {}),
        items: {
          create: orderItems,
        },
      },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Не удалось создать заказ";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Регистрируем заказ с промокодом в MAXMA (best effort — заказ уже создан)
  if (promo) {
    const orderId = order.id;
    setOrder(orderId, lines, promoCode, customer.phone).catch((e) =>
      console.error(`[maxma] set-order site-${orderId} failed:`, e instanceof Error ? e.message : e)
    );
  }

  // Уведомление покупателю о принятом заказе
  if (customer.email) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://kosmetichka-opt.ru";
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { id: "asc" },
    });
    const itemsHtml = orderItems
      .map(
        (it) =>
          `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escHtml(it.productName)}${it.variantName ? ` <span style="color:#6366f1;">(${escHtml(it.variantName)})</span>` : ""}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.quantity}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${it.total.toLocaleString("ru-RU")} ₽</td>
          </tr>`
      )
      .join("");

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
            ${promo ? `<div style="font-size:14px;color:#475569;margin-bottom:4px;">Сумма без скидки: ${(order.total + order.discount).toLocaleString("ru-RU")} ₽</div>
            <div style="font-size:14px;color:#16a34a;margin-bottom:6px;">Скидка по промокоду ${escHtml(promoCode)}: −${order.discount.toLocaleString("ru-RU")} ₽</div>` : ""}
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
          <p style="margin:0 0 ${promo ? 8 : 24}px;color:#475569;"><b>Сумма:</b> ${order.total} ₽</p>
          ${promo ? `<p style="margin:0 0 24px;color:#475569;"><b>Промокод:</b> ${escHtml(promoCode)} — скидка ${order.discount} ₽</p>` : ""}
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
