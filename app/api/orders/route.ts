import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyStaffLater } from "@/lib/staffNotify";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { sendMail } from "@/lib/mail";
import { orderCreationLimiter } from "@/lib/rateLimit";
import { priceOrder, type PricedLine } from "@/lib/orderPricing";
import type { PriceType } from "@/lib/pricing";
import {
  BONUS_SPEND_FORBIDDEN,
  calcLoyalty,
  canSpendBonuses,
  maxmaConfigured,
  MaxmaError,
  setLoyaltyOrderQuery,
  setOrderQuery,
  type LoyaltyResult,
  type PromoResult,
} from "@/lib/maxma";
import { adoptReservedBonuses, BONUSES_UNAVAILABLE, BONUSES_UNAVAILABLE_CODE } from "@/lib/maxmaOrders";
import { enqueueMaxmaTask, runOrderMaxmaTasks } from "@/lib/maxmaQueue";
import { PROMO_NOT_FOR_ITEMS } from "@/lib/promo";
import { ADDRESS_REQUIRED, cleanAddress, needsShopAddress } from "@/lib/shopAddress";

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

  const { items, comment, promocode, applyBonuses: rawApplyBonuses, address: rawAddress } = await request.json();

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

  // wholesale accounts made before the address was asked at registration: they give it now (saved to the profile)
  if (needsShopAddress(customer.priceType) && !cleanAddress(customer.address)) {
    const address = cleanAddress(rawAddress);
    if (!address) return NextResponse.json({ error: ADDRESS_REQUIRED, code: "address_required" }, { status: 400 });
    await prisma.customer.update({ where: { id: customer.id }, data: { address } });
    customer.address = address;
  }

  if (applyBonuses > 0 && !canSpendBonuses(customer)) {
    return NextResponse.json({ error: BONUS_SPEND_FORBIDDEN }, { status: 400 });
  }

  let order;
  let lines: PricedLine[];
  let tier: PriceType;
  let promo: PromoResult | null = null;

  try {
    ({ lines, tier } = await priceOrder(customer, items));
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Не удалось создать заказ";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // no minimum order: «Опт» gets the price by the order sum (discount → wholesale → big wholesale)

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

  const orderItems = lines.map(({ sku: _sku, ...line }, i) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
    ...line,
    ...(promo ? { discount: promo.lines[i] } : {}),
    ...(bonusLines[i] > 0 ? { bonusDiscount: bonusLines[i] } : {}),
  }));
  const linesTotal = orderItems.reduce((s, it) => s + it.total, 0);
  const promoDiscount = promo ? promo.discount : 0;
  const orderData = {
    customerId: Number(payload.id),
    status: "pending",
    priceType: customer.priceType,
    priceTier: tier,
    total: linesTotal - promoDiscount - bonusesApplied,
    comment: comment || null,
    ...(promo ? { promoCode, discount: promo.discount } : {}),
    ...(bonusesApplied > 0 ? { bonusesApplied } : {}),
    ...(bonusesCollected > 0 ? { bonusesCollected } : {}),
    items: { create: orderItems },
  };
  const maxmaQuery = setOrderQuery(lines, { customer, promocode: promo ? promoCode : null, applyBonuses: bonusesApplied });

  if (bonusesApplied > 0) {
    // Spent bonuses are reserved in MAXMA BEFORE the order is committed: the MAXMA id
    // «site-<id>» needs the order id, so the order is created inside a transaction, set-order
    // is called with it and the order is committed only when MAXMA reserved the bonuses.
    // id: set-order was sent for this order id (bonuses maybe reserved); failed: no / wrong reservation
    const reservation: { id: number | null; failed: boolean } = { id: null, failed: false };
    try {
      order = await prisma.$transaction(
        async (tx) => {
          const created = await tx.order.create({
            data: orderData,
            include: { items: { orderBy: { id: "asc" }, select: { id: true } } },
          });
          reservation.id = created.id;
          let r;
          try {
            r = await setLoyaltyOrderQuery(created.id, maxmaQuery);
          } catch (e) {
            reservation.failed = true;
            throw e;
          }
          if (r.applied === bonusesApplied) return created;

          // MAXMA reserved another amount: the order takes MAXMA's amount (never more than asked)
          const adopted = adoptReservedBonuses({
            reserved: r.applied,
            requested: applyBonuses,
            bonusRows: r.bonusRows,
            lineTotals: orderItems.map((it) => it.total),
            promoLines: promo ? promo.lines : orderItems.map(() => 0),
          });
          if (!adopted) {
            reservation.failed = true;
            throw new Error(`MAXMA reserved ${r.applied} bonuses, order spends ${bonusesApplied}: can't adopt`);
          }
          console.warn(`[maxma] site-${created.id}: MAXMA reserved ${r.applied} instead of ${bonusesApplied}, order adjusted`);
          for (let i = 0; i < created.items.length; i++) {
            if ((bonusLines[i] ?? 0) !== adopted.lines[i]) {
              await tx.orderItem.update({ where: { id: created.items[i].id }, data: { bonusDiscount: adopted.lines[i] } });
            }
          }
          return tx.order.update({
            where: { id: created.id },
            data: {
              bonusesApplied: adopted.applied,
              bonusesCollected: r.collected,
              total: linesTotal - promoDiscount - adopted.applied,
            },
            include: { items: { orderBy: { id: "asc" }, select: { id: true } } },
          });
        },
        { maxWait: 5_000, timeout: 15_000 }
      );
    } catch (error) {
      // set-order may have reserved the bonuses (even on a timeout): release them via the queue
      // (task saved now, the call runs in the background — MAXMA may be the one not answering)
      const sentId = reservation.id;
      if (sentId != null) {
        await enqueueMaxmaTask(sentId, "cancel", null, { run: false });
        void runOrderMaxmaTasks(sentId);
        console.error(
          `[maxma] order with bonuses NOT created (site-${sentId}, card ${customer.loyaltyCard}, bonuses ${bonusesApplied}), cancel-order queued:`,
          error instanceof MaxmaError ? error.detail || error.message : error
        );
      }
      if (reservation.failed) {
        return NextResponse.json({ error: BONUSES_UNAVAILABLE, code: BONUSES_UNAVAILABLE_CODE }, { status: 409 });
      }
      console.error(error);
      const message = error instanceof Error ? error.message : "Не удалось создать заказ";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    try {
      order = await prisma.order.create({ data: orderData });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Не удалось создать заказ";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    // Promo code / accrual only: registered in MAXMA through the queue (one attempt now, retried later)
    if (promo || bonusesCollected > 0) await enqueueMaxmaTask(order.id, "set", maxmaQuery);
  }

  // staff browsers (admin website): «Новый заказ №N»
  notifyStaffLater({ kind: "new-order", orderId: order.id });

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
