import { isCardProduct } from "@/lib/cardPurchase";
import { cookies } from "next/headers";
import { bonusSpendOff, pricingCustomer } from "@/lib/siteMode";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { checkoutCalcLimiter } from "@/lib/rateLimit";
import { priceOrder, loyaltyLines } from "@/lib/orderPricing";
import { BONUS_SPEND_FORBIDDEN, calcLoyalty, canSpendBonuses, maxmaConfigured, maxmaPhone, type LoyaltyResult } from "@/lib/maxma";
import { PROMO_NOT_FOR_ITEMS } from "@/lib/promo";
import { minOrderFor } from "@/lib/pricing";

// POST /api/checkout/calc { items: [{ id, quantity, variantName? }], promocode?, applyBonuses? }
// Prices the cart like POST /api/orders and asks MAXMA (one v2/calculate-purchase) for the
// promo discount, bonuses to spend (retail customers with a linked card) and the accrual.
// 200 { subtotal, promo, promoError?, bonuses, total, loyaltyError? }
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  const payload = await verifyCustomerToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const rl = checkoutCalcLimiter.check(`checkout:${payload.id}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  const promocode = typeof body?.promocode === "string" ? body.promocode.trim().slice(0, 64) : "";
  const rawBonuses = body?.applyBonuses ?? 0;
  const applyBonuses = Number(rawBonuses);
  if (!Number.isInteger(applyBonuses) || applyBonuses < 0) {
    return NextResponse.json({ error: "Некорректное количество бонусов" }, { status: 400 });
  }
  if (items.length === 0) return NextResponse.json({ error: "Корзина пустая" }, { status: 400 });
  if (items.length > 500) {
    return NextResponse.json({ error: "Слишком много позиций в заказе (максимум 500)" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id: Number(payload.id) } });
  if (!customer) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  // Linked retail bonus and discount cards may accrue and spend bonuses when enabled.
  const canSpend = canSpendBonuses(customer) && !bonusSpendOff(request);
  if (applyBonuses > 0 && !canSpend) return NextResponse.json({ error: BONUS_SPEND_FORBIDDEN }, { status: 400 });

  let lines;
  let pricing;
  try {
    const priced = await priceOrder(pricingCustomer(customer, request), items);
    if (priced.lines.some((l) => isCardProduct({ name: l.productName, guid: l.sku })) && !maxmaPhone(customer.phone ?? "")) throw new Error("Для оформления карты укажите российский телефон в профиле");
    pricing = priced.pricing;
    lines = loyaltyLines(priced.lines, pricing).filter((l) => !isCardProduct({ name: l.productName, guid: l.sku }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось рассчитать корзину" }, { status: 400 });
  }
  const subtotal = pricing.subtotal;
  const automatic = {
    priceTier: pricing.tier,
    wholesalePromo: pricing.percent > 0 ? {
      name: "Светлая пятница + ОПТ", percent: pricing.percent,
      eligibleSubtotal: pricing.eligibleSubtotal, discount: pricing.discount,
    } : null,
  };
  const hasCard = Boolean(customer.loyaltyCard?.trim());

  // Nothing to ask MAXMA about
  if ((!promocode && !hasCard) || !lines.length) {
    return NextResponse.json({ ...automatic, subtotal, promo: null, bonuses: null, total: pricing.total });
  }
  if (!maxmaConfigured()) {
    return NextResponse.json({
      ...automatic,
      subtotal,
      promo: null,
      ...(promocode ? { promoError: "Промокоды временно недоступны" } : {}),
      bonuses: null,
      total: pricing.total,
      loyaltyError: "Сервис лояльности недоступен",
    });
  }

  let calc: LoyaltyResult;
  try {
    calc = await calcLoyalty({ customer, lines, promocode, applyBonuses, withBalance: true });
    const room = Math.max(0, Math.floor(pricing.total - (calc.promo?.applied ? calc.promo.discount : 0) - minOrderFor(customer, items)));
    if ((calc.bonuses?.applied ?? 0) > room) {
      calc = await calcLoyalty({ customer, lines, promocode, applyBonuses: room, withBalance: true });
    }
  } catch {
    return NextResponse.json({
      ...automatic,
      subtotal,
      promo: null,
      ...(promocode ? { promoError: "Сервис лояльности недоступен, попробуйте позже" } : {}),
      bonuses: null,
      total: pricing.total,
      loyaltyError: "Сервис лояльности недоступен, попробуйте позже",
    });
  }

  let promo: { code: string; name: string | null; discount: number } | null = null;
  let promoError: string | undefined;
  if (calc.promo) {
    if (calc.promo.applied && calc.promo.discount > 0) {
      promo = { code: promocode, name: calc.promo.name ?? null, discount: calc.promo.discount };
    } else {
      promoError = calc.promo.applied ? PROMO_NOT_FOR_ITEMS : calc.promo.error || "Промокод не применён";
    }
  }
  const b = calc.bonuses;
  const room = Math.max(0, Math.floor(pricing.total - (promo?.discount ?? 0) - minOrderFor(customer, items)));
  const bonuses = b
    ? { canSpend, balance: b.balance, maxToApply: Math.min(b.maxToApply, room), applied: b.applied, collected: b.collected }
    : null;
  return NextResponse.json({
    ...automatic,
    subtotal,
    promo,
    ...(promoError ? { promoError } : {}),
    bonuses,
    total: Math.round((pricing.total - (promo?.discount ?? 0) - (b?.applied ?? 0)) * 100) / 100,
  });
}

