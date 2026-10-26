import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { promoCheckLimiter } from "@/lib/rateLimit";
import { priceOrderItems } from "@/lib/orderPricing";
import { calcPromo, maxmaConfigured, MaxmaError } from "@/lib/maxma";
import { PROMO_NOT_FOR_ITEMS } from "@/lib/promo";

// POST /api/promo/check { code, items: [{ id, quantity, variantName? }] }
// Prices the cart like POST /api/orders and asks MAXMA how much the promo code takes off.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Нужно войти в аккаунт" }, { status: 401 });
  }
  const payload = await verifyCustomerToken(token);
  if (!payload?.id) {
    return NextResponse.json({ ok: false, error: "Ошибка авторизации" }, { status: 401 });
  }

  const rl = promoCheckLimiter.check(`promo:${payload.id}`);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().slice(0, 64) : "";
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!code) return NextResponse.json({ ok: false, error: "Введите промокод" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ ok: false, error: "Корзина пустая" }, { status: 400 });
  if (items.length > 500) {
    return NextResponse.json({ ok: false, error: "Слишком много позиций в заказе (максимум 500)" }, { status: 400 });
  }

  if (!maxmaConfigured()) {
    return NextResponse.json({ ok: false, error: "Промокоды временно недоступны" }, { status: 503 });
  }

  const customer = await prisma.customer.findUnique({ where: { id: Number(payload.id) } });
  if (!customer) return NextResponse.json({ ok: false, error: "Ошибка авторизации" }, { status: 401 });

  let lines;
  try {
    lines = await priceOrderItems(customer, items);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Не удалось рассчитать корзину" },
      { status: 400 }
    );
  }

  let promo;
  try {
    promo = await calcPromo(lines, code, customer.phone);
  } catch (e) {
    const status = e instanceof MaxmaError && e.status === 503 ? 503 : 502;
    return NextResponse.json(
      { ok: false, error: "Сервис лояльности недоступен, попробуйте позже" },
      { status }
    );
  }

  if (!promo.applied || promo.discount <= 0) {
    return NextResponse.json(
      { ok: false, error: promo.applied ? PROMO_NOT_FOR_ITEMS : promo.error || "Промокод не применён" },
      { status: 400 }
    );
  }

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  return NextResponse.json({
    ok: true,
    code,
    name: promo.name ?? null,
    subtotal,
    discount: promo.discount,
    total: subtotal - promo.discount,
    lines: promo.lines.map((discount, index) => ({ index, discount })),
  });
}
