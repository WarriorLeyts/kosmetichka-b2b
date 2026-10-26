/**
 * MAXMA loyalty API (the same account 1C works with).
 * Env: MAXMA_API_KEY (X-Processing-Key), MAXMA_API_URL (default https://api.maxma.com),
 *      MAXMA_CASHBACK — cashback % by level name, e.g. «Базовый:3,VIP:5».
 * The key never leaves the server.
 */

export class MaxmaError extends Error {
  constructor(message: string, public readonly status: number, public readonly notFound = false) {
    super(message);
  }
}

export function maxmaConfigured() {
  return Boolean(process.env.MAXMA_API_KEY);
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const key = process.env.MAXMA_API_KEY;
  if (!key) throw new MaxmaError("not_configured", 503);
  const base = (process.env.MAXMA_API_URL || "https://api.maxma.com").replace(/\/+$/, "");
  const url = /^https?:\/\//.test(base) ? base : `https://${base}`;
  let res: Response;
  try {
    res = await fetch(`${url}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Processing-Key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    throw new MaxmaError("unavailable", 502);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.errorCode || data?.error) {
    const text = JSON.stringify(data ?? "");
    const notFound = res.status === 404 || /not.?found|не найден|ClientNotFound|CardNotFound/i.test(text);
    if (!notFound) console.error(`[maxma] ${method}`, res.status, text.slice(0, 300));
    throw new MaxmaError(notFound ? "not_found" : "unavailable", notFound ? 404 : 502, notFound);
  }
  return data as T;
}

export type LoyaltyCard = {
  number: string; // card number = barcode
  name: string;
  level: string | null;
  cashback: string | null;
  bonuses: number;
  pendingBonuses: number;
  phone: string | null; // as MAXMA stores it — server-side only, never sent to the app
};

function cashbackFor(level: string | null): string | null {
  if (!level) return null;
  for (const pair of (process.env.MAXMA_CASHBACK ?? "").split(",")) {
    const [name, pct] = pair.split(":").map((s) => s?.trim());
    if (name && pct && name.toLowerCase() === level.toLowerCase()) return `${pct}%`;
  }
  return null;
}

/** Digits of a Russian phone → +7XXXXXXXXXX, or null. */
export function maxmaPhone(value: string): string | null {
  const d = String(value).replace(/\D/g, "");
  if (d.length === 11 && (d.startsWith("7") || d.startsWith("8"))) return "+7" + d.slice(1);
  if (d.length === 10 && d.startsWith("9")) return "+7" + d;
  return null;
}

/** Client by phone or card number; null when MAXMA has no such client / card. */
export async function findCard(by: { phoneNumber?: string; card?: string }): Promise<LoyaltyCard | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await call("get-balance", by);
    const c = data?.client ?? {};
    const number = String(c.cardString || c.card || "").trim();
    if (!number) return null;
    const level: string | null = data?.level?.name ?? null;
    return {
      number,
      name: String(c.name || c.fullName || "").trim(),
      level,
      cashback: cashbackFor(level),
      bonuses: Number(c.bonuses) || 0,
      pendingBonuses: Number(c.pendingBonuses) || 0,
      phone: c.phoneNumber ? String(c.phoneNumber) : null,
    };
  } catch (e) {
    if (e instanceof MaxmaError && e.notFound) return null;
    throw e;
  }
}

/** MAXMA texts the client a code (to the phone in their MAXMA profile) and returns it to us. */
export async function sendCode(card: string): Promise<{ code: string; expiresAt: number }> {
  const r = await call<{ code: string; expiresAt?: string }>("send-confirmation-code", { card });
  if (!r?.code) throw new MaxmaError("unavailable", 502);
  const exp = r.expiresAt ? Date.parse(r.expiresAt) : NaN;
  return { code: String(r.code), expiresAt: Number.isFinite(exp) ? exp : Date.now() + 10 * 60_000 };
}

/** «+7 *** ***-12-34» */
export function maskPhone(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 4) return null;
  return `+7 *** ***-${d.slice(-4, -2)}-${d.slice(-2)}`;
}

/** What the app gets: everything except the phone stored in MAXMA. */
export function publicCard(c: LoyaltyCard) {
  const { phone: _phone, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

// ── Promo codes (v2 calculate-purchase / set-order) ─────────────────────────

/** What a promo calculation needs from a priced cart line. */
export type PromoLine = { sku: string; productName: string; price: number; quantity: number; total: number };

export type PromoResult = {
  applied: boolean;
  name?: string;
  /** MAXMA's reason when the code was not applied */
  error?: string;
  /** Promo discount, whole roubles (rounded down) */
  discount: number;
  /** Per-line discount, whole roubles, same order as the input; sums exactly to `discount` */
  lines: number[];
};

/** v2 calculationQuery for the cart: only the promo code counts — no bonuses, no offers. */
export function promoCalculationQuery(lines: PromoLine[], code: string, phone?: string | null) {
  const client = phone ? maxmaPhone(phone) : null;
  return {
    ...(client ? { client: { phoneNumber: client } } : {}),
    shop: { code: "online", name: "Интернет-магазин" },
    rows: lines.map((l, i) => ({
      id: String(i),
      product: { sku: l.sku, title: l.productName, blackPrice: l.price },
      qty: l.quantity,
      noOffer: true, // only the promo code: no automatic offers
    })),
    promocode: code,
    applyBonuses: 0,
    collectBonuses: 0,
  };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Splits MAXMA's promo discount into whole roubles: floor per line, then the remainder
 * (up to floor of the summary promo discount) goes 1 ₽ at a time to the lines with the
 * largest fractional parts. A line discount never exceeds its line total.
 */
export function splitPromoDiscount(rowAmounts: number[], summaryAmount: number | null, lineTotals: number[]) {
  const floor = (x: number) => Math.floor(x + 1e-6); // 99.9999999 from float math is 100
  const raw = rowAmounts.map((a, i) => Math.min(num(a), lineTotals[i]));
  const parts = raw.map(floor);
  const rawSum = raw.reduce((s, a) => s + a, 0);
  const cap = lineTotals.reduce((s, t) => s + t, 0);
  const target = Math.min(floor(summaryAmount != null ? num(summaryAmount) : rawSum), cap);
  let rest = target - parts.reduce((s, a) => s + a, 0);
  if (rest > 0) {
    const order = raw
      .map((a, i) => ({ i, frac: a - floor(a), share: a }))
      .sort((x, y) => y.frac - x.frac || y.share - x.share);
    // Round-robin until the remainder is placed (lines with share first, then any line with room)
    for (const pass of [0, 1]) {
      for (const { i, share } of order) {
        if (rest <= 0) break;
        if (pass === 0 && share <= 0) continue;
        const room = lineTotals[i] - parts[i];
        const add = Math.min(room, pass === 0 ? 1 : rest);
        if (add > 0) {
          parts[i] += add;
          rest -= add;
        }
      }
    }
  }
  const discount = parts.reduce((s, a) => s + a, 0);
  return { discount, lines: parts };
}

/**
 * Validates and calculates a promo code for the cart via MAXMA v2/calculate-purchase.
 * Only the promocode part of MAXMA's discounts is used. Throws MaxmaError (503 not
 * configured / 502 unavailable).
 */
export async function calcPromo(lines: PromoLine[], code: string, customerPhone?: string | null): Promise<PromoResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = await call("v2/calculate-purchase", { calculationQuery: promoCalculationQuery(lines, code, customerPhone) });
  } catch (e) {
    // A phone MAXMA doesn't know must not block the code: calculate anonymously
    if (e instanceof MaxmaError && e.notFound && customerPhone) {
      data = await call("v2/calculate-purchase", { calculationQuery: promoCalculationQuery(lines, code, null) });
    } else {
      throw e;
    }
  }
  const r = data?.calculationResult;
  if (!r) throw new MaxmaError("unavailable", 502);
  const p = r.promocode ?? {};
  const none = lines.map(() => 0);
  if (!p.applied) {
    return {
      applied: false,
      name: p.name || undefined,
      error: String(p.error?.description || "Промокод не применён"),
      discount: 0,
      lines: none,
    };
  }
  const byId = new Map<string, number>();
  for (const row of Array.isArray(r.rows) ? r.rows : []) {
    byId.set(String(row?.id), num(row?.discounts?.promocode));
  }
  const summary = r.summary?.discounts?.promocode;
  const split = splitPromoDiscount(
    lines.map((_, i) => byId.get(String(i)) ?? 0),
    summary != null ? num(summary) : null,
    lines.map((l) => l.total)
  );
  return { applied: true, name: p.name || undefined, ...split };
}

/** Registers the site order in MAXMA (best effort: callers log errors). */
export async function setOrder(orderId: number, lines: PromoLine[], code: string, customerPhone?: string | null) {
  const send = (phone: string | null | undefined) =>
    call("v2/set-order", { orderId: `site-${orderId}`, calculationQuery: promoCalculationQuery(lines, code, phone) });
  try {
    await send(customerPhone);
  } catch (e) {
    // Same as calcPromo: a client MAXMA doesn't know → register the order anonymously
    if (e instanceof MaxmaError && e.notFound && customerPhone) await send(null);
    else throw e;
  }
}

export async function confirmOrder(orderId: number) {
  await call("confirm-order", { orderId: `site-${orderId}` });
}

export async function cancelOrder(orderId: number) {
  await call("cancel-order", { orderId: `site-${orderId}` });
}
