import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { sendMail } from "@/lib/mail";
import { orderCreationLimiter } from "@/lib/rateLimit";
import { priceOrderItems, type PricedLine } from "@/lib/orderPricing";
import {
  BONUS_SPEND_FORBIDDEN,
  calcLoyalty,
  canSpendBonuses,
  maxmaConfigured,
  MaxmaError,
  setLoyaltyOrder,
  type LoyaltyResult,
  type PromoResult,
} from "@/lib/maxma";
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

  const { items, comment, promocode, applyBonuses: rawApplyBonuses } = await request.json();

  // Bonuses to spend: whole number ≥ 0 (1 bonus = 1 ₽ discount)
  const applyBonuses = Number(rawApplyBonuses ?? 0);
  if (!Number.isInteger(applyBonuses) || applyBonuses < 0) {
    return NextResponse.json({ error: "Некорректное количество бонусов" }, { status: 400 });
  }

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

  if (applyBonuses > 0 && !canSpendBonuses(customer)) {
    return NextResponse.json({ error: BONUS_SPEND_FORBIDDEN }, { status: 400 });
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

  // Promo code / bonuses: MAXMA calculates them again on the server-side prices (one
  // v2/calculate-purchase, like the shop's cash desks). A linked card also gets the accrual.
  const promoCode = typeof promocode === "string" ? promocode.trim().slice(0, 64) : "";
  const hasCard = Boolean(customer.loyaltyCard?.trim());
  let calc: LoyaltyResult | null = null;
  if (promoCode || hasCard) {
    try {
      if (!maxmaConfigured()) throw new MaxmaError("not_configured", 503);
      calc = await calcLoyalty({ customer, lines, promocode: promoCode || null, applyBonuses });
    } catch (e) {
      const status = e instanceof MaxmaError && e.status === 503 ? 503 : 502;
      if (promoCode) {
        return NextResponse.json(
          { error: "Промокод: сервис лояльности недоступен, попробуйте позже или оформите заказ без промокода" },
          { status }
        );
      }
      if (applyBonuses > 0) {
        return NextResponse.json(
          { error: "Бонусы: сервис лояльности недоступен, попробуйте позже или оформите заказ без списания бонусов" },
          { status }
        );
      }
      // Accrual only: the order goes through without it
      console.error(`[maxma] customer ${customer.id}: calculation failed, order placed without bonus accrual:`, e instanceof Error ? e.message : e);
    }
  }
  if (promoCode && calc?.promo) {
    promo = calc.promo;
    if (!promo.applied || promo.discount <= 0) {
      const reason = promo.applied ? PROMO_NOT_FOR_ITEMS : promo.error || "не применён";
      return NextResponse.json({ error: `Промокод: ${reason}` }, { status: 400 });
    }
  }
  // MAXMA may allow fewer bonuses than asked (maxToApply / balance): its amount is used
  const bonusesApplied = calc?.bonuses?.applied ?? 0;
  const bonusesCollected = calc?.bonuses?.collected ?? 0;
  const bonusLines = calc?.bonusLines ?? lines.map(() => 0);

  try {
    const orderItems = lines.map(({ sku: _sku, ...line }, i) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
      ...line,
      ...(promo ? { discount: promo.lines[i] } : {}),
      ...(bonusLines[i] > 0 ? { bonusDiscount: bonusLines[i] } : {}),
    }));

    let total = 0;
    for (const it of orderItems) total += it.total;
    if (promo) total -= promo.discount;
    total -= bonusesApplied;

    order = await prisma.order.create({
      data: {
        customerId: Number(payload.id),
        status: "pending",
        total,
        comment: comment || null,
        ...(promo ? { promoCode, discount: promo.discount } : {}),
        ...(bonusesApplied > 0 ? { bonusesApplied } : {}),
        ...(bonusesCollected > 0 ? { bonusesCollected } : {}),
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

  // Регистрируем заказ в MAXMA (промокод, резерв списанных бонусов, начисление) — best effort,
  // заказ уже создан. Без регистрации бонусы не зарезервированы: громко в лог.
  if (promo || bonusesApplied > 0 || bonusesCollected > 0) {
    const orderId = order.id;
    setLoyaltyOrder(orderId, lines, { customer, promocode: promo ? promoCode : null, applyBonuses: bonusesApplied })
      .then((r) => {
        if (bonusesApplied > 0 && r.applied !== bonusesApplied) {
          console.error(`[maxma] BONUSES MISMATCH site-${orderId}: order spends ${bonusesApplied}, MAXMA reserved ${r.applied}`);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : e;
        if (bonusesApplied > 0) {
          console.error(`[maxma] BONUSES NOT RESERVED: set-order site-${orderId} failed, order spends ${bonusesApplied} bonuses (card ${customer.loyaltyCard}):`, msg);
        } else {
          console.error(`[maxma] set-order site-${orderId} failed:`, msg);
        }
      });
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
            ${promo || order.bonusesApplied > 0 ? `<div style="font-size:14px;color:#475569;margin-bottom:4px;">Сумма без скидки: ${(order.total + order.discount + order.bonusesApplied).toLocaleString("ru-RU")} ₽</div>` : ""}
            ${promo ? `<div style="font-size:14px;color:#16a34a;margin-bottom:6px;">Скидка по промокоду ${escHtml(promoCode)}: −${order.discount.toLocaleString("ru-RU")} ₽</div>` : ""}
            ${order.bonusesApplied > 0 ? `<div style="font-size:14px;color:#16a34a;margin-bottom:6px;">Списано бонусов: ${order.bonusesApplied.toLocaleString("ru-RU")}</div>` : ""}
            <strong style="font-size:16px;color:#1e293b;">Итого: ${order.total.toLocaleString("ru-RU")} ₽</strong>
            ${order.bonusesCollected > 0 ? `<div style="font-size:13px;color:#6366f1;margin-top:6px;">Будет начислено: ${order.bonusesCollected.toLocaleString("ru-RU")} бонусов</div>` : ""}
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
          <p style="margin:0 0 ${promo || order.bonusesApplied > 0 || order.bonusesCollected > 0 ? 8 : 24}px;color:#475569;"><b>Сумма:</b> ${order.total} ₽</p>
          ${promo ? `<p style="margin:0 0 8px;color:#475569;"><b>Промокод:</b> ${escHtml(promoCode)} — скидка ${order.discount} ₽</p>` : ""}
          ${order.bonusesApplied > 0 ? `<p style="margin:0 0 8px;color:#475569;"><b>Списано бонусов:</b> ${order.bonusesApplied}</p>` : ""}
          ${order.bonusesCollected > 0 ? `<p style="margin:0 0 8px;color:#475569;"><b>Будет начислено:</b> ${order.bonusesCollected} бонусов</p>` : ""}
          ${promo || order.bonusesApplied > 0 || order.bonusesCollected > 0 ? `<div style="height:16px;"></div>` : ""}
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
    total: order.total,
    discount: order.discount,
    bonusesApplied: order.bonusesApplied,
    bonusesCollected: order.bonusesCollected,
    ...(applyBonuses > order.bonusesApplied
      ? { loyaltyWarning: `Списано бонусов: ${order.bonusesApplied} — столько разрешил сервис лояльности для этого заказа.` }
      : {}),
  });
}
