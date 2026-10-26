/**
 * MAXMA loyalty API (the same account 1C works with).
 * Env: MAXMA_API_KEY (X-Processing-Key), MAXMA_API_URL (default https://api.maxma.com),
 *      MAXMA_CASHBACK — cashback % by level name, e.g. «Базовый:3,VIP:5».
 * The key never leaves the server.
 */

export class MaxmaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly notFound = false,
    /** What happened, for logs / admin («v2/set-order: HTTP 400 {...}»); never shown to customers */
    public readonly detail?: string
  ) {
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
  } catch (e) {
    const why = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "нет ответа за 8 с" : "сеть недоступна";
    throw new MaxmaError("unavailable", 502, false, `${method}: ${why}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.errorCode || data?.error) {
    const text = JSON.stringify(data ?? "");
    const notFound = res.status === 404 || /not.?found|не найден|ClientNotFound|CardNotFound/i.test(text);
    if (!notFound) console.error(`[maxma] ${method}`, res.status, text.slice(0, 300));
    throw new MaxmaError(notFound ? "not_found" : "unavailable", notFound ? 404 : 502, notFound, `${method}: HTTP ${res.status} ${text.slice(0, 200)}`);
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
  return parsePromo(r, lines);
}

export async function confirmOrder(orderId: number) {
  await call("confirm-order", { orderId: `site-${orderId}` });
}

export async function cancelOrder(orderId: number) {
  await call("cancel-order", { orderId: `site-${orderId}` });
}

// ── Bonuses + promo code in one calculation (v2/calculate-purchase) ─────────

/** Customer fields the loyalty calculation needs. */
export type LoyaltyCustomer = {
  phone?: string | null;
  /** Linked MAXMA card (Customer.loyaltyCard) */
  loyaltyCard?: string | null;
  priceType?: string | null;
};

/**
 * Retail buyers — bonus card («Розница») and discount card («Скидка») — get MAXMA bonuses;
 * wholesale and big wholesale never do.
 */
export function bonusPriceType(priceType: string | null | undefined): boolean {
  return priceType === "retail" || priceType === "discount";
}

/** Bonuses may be spent (and are accrued) only for retail buyers with a linked card. */
export function canSpendBonuses(c: LoyaltyCustomer | null | undefined): boolean {
  return Boolean(c?.loyaltyCard?.trim()) && bonusPriceType(c?.priceType);
}

export const BONUS_SPEND_FORBIDDEN = "Списание бонусов доступно только розничным покупателям с картой";

export type LoyaltyBonuses = {
  /** Client's available bonuses (null when MAXMA didn't tell) */
  balance: number | null;
  /** How many bonuses MAXMA allows to spend on this cart */
  maxToApply: number;
  /** Bonuses spent = ₽ discount, whole roubles; equals Σ bonusLines */
  applied: number;
  /** Bonuses MAXMA will accrue for this purchase */
  collected: number;
  /** MAXMA's note about spending (e.g. not enough bonuses) */
  error?: string;
};

export type LoyaltyResult = {
  /** null when no promo code was given */
  promo: PromoResult | null;
  /** null when the customer has no linked card (or MAXMA doesn't know it) */
  bonuses: LoyaltyBonuses | null;
  /** Per-line bonus discount, whole roubles, same order as the input */
  bonusLines: number[];
};

export type LoyaltyOptions = {
  customer: LoyaltyCustomer;
  lines: PromoLine[];
  promocode?: string | null;
  /** Bonuses the customer wants to spend (capped by MAXMA's maxToApply) */
  applyBonuses?: number;
  /** Spending allowed (default: canSpendBonuses(customer)); otherwise applyBonuses is forced to 0 */
  spendAllowed?: boolean;
  /** Also fetch the client's balance (get-balance) when MAXMA's result doesn't include it */
  withBalance?: boolean;
};

type ClientRef = { card: string } | { phoneNumber: string } | null;

function clientRef(c: LoyaltyCustomer): ClientRef {
  // bonuses (spending AND accrual) only for retail buyers (bonus or discount card); wholesale /
  // big wholesale orders go without the card, so MAXMA neither reserves nor accrues anything for them
  const card = bonusPriceType(c.priceType) ? c.loyaltyCard?.trim() : "";
  if (card) return { card };
  // No card: the phone identifies the client for the promo code only (as before), no bonuses
  const phone = c.phone ? maxmaPhone(c.phone) : null;
  return phone ? { phoneNumber: phone } : null;
}

/** Whole number ≥ 0 of bonuses to spend (bad input → 0). */
export function bonusAmount(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** v2 calculationQuery: promo code and/or bonuses; rows without automatic offers. */
export function loyaltyCalculationQuery(
  lines: PromoLine[],
  q: { client: ClientRef; promocode?: string | null; applyBonuses: number; collect: boolean }
) {
  const withCard = Boolean(q.client && "card" in q.client);
  return {
    ...(q.client ? { client: q.client } : {}),
    shop: { code: "online", name: "Интернет-магазин" },
    rows: lines.map((l, i) => ({
      id: String(i),
      product: { sku: l.sku, title: l.productName, blackPrice: l.price },
      qty: l.quantity,
      noOffer: true, // only promo code / bonuses: no automatic offers
    })),
    ...(q.promocode ? { promocode: q.promocode } : {}),
    applyBonuses: withCard ? bonusAmount(q.applyBonuses) : 0,
    collectBonuses: withCard && q.collect ? "auto" : 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePromo(r: any, lines: PromoLine[]): PromoResult {
  const p = r.promocode ?? {};
  const none = lines.map(() => 0);
  if (!p.applied) {
    return { applied: false, name: p.name || undefined, error: String(p.error?.description || "Промокод не применён"), discount: 0, lines: none };
  }
  const byId = new Map<string, number>();
  for (const row of Array.isArray(r.rows) ? r.rows : []) byId.set(String(row?.id), num(row?.discounts?.promocode));
  const summary = r.summary?.discounts?.promocode;
  const split = splitPromoDiscount(
    lines.map((_, i) => byId.get(String(i)) ?? 0),
    summary != null ? num(summary) : null,
    lines.map((l) => l.total)
  );
  return { applied: true, name: p.name || undefined, ...split };
}

/**
 * Per-line bonus discount in whole roubles (same floor + remainder rule as the promo code),
 * never more than what is left of a line after its promo discount, never more than `applied`.
 */
export function splitBonusDiscount(rowAmounts: number[], applied: number, lineTotals: number[], promoLines: number[]) {
  const room = lineTotals.map((t, i) => Math.max(0, t - (promoLines[i] ?? 0)));
  return splitPromoDiscount(rowAmounts, Math.max(0, Math.floor(applied)), room);
}

/**
 * One v2/calculate-purchase for the cart, like the shop's cash desks: promo code (if any),
 * bonuses to spend (only with spending allowed, capped by MAXMA's maxToApply) and accrual
 * («auto») for a linked card. MAXMA decides how promo + bonuses combine. A linked card MAXMA
 * doesn't know → calculated anonymously (bonuses null). Throws MaxmaError (503 / 502).
 */
export async function calcLoyalty(o: LoyaltyOptions): Promise<LoyaltyResult> {
  const { lines } = o;
  const promocode = o.promocode?.trim() || null;
  const spendAllowed = o.spendAllowed ?? canSpendBonuses(o.customer);
  let requested = spendAllowed ? bonusAmount(o.applyBonuses) : 0;
  let client = clientRef(o.customer);
  const card = client && "card" in client ? client.card : null;

  // Balance in parallel (only needed for the cart UI)
  const balanceP: Promise<number | null> =
    card && o.withBalance
      ? findCard({ card }).then((c) => (c ? c.bonuses : null)).catch(() => null)
      : Promise.resolve(null);

  const run = (apply: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call<any>("v2/calculate-purchase", {
      calculationQuery: loyaltyCalculationQuery(lines, { client, promocode, applyBonuses: apply, collect: true }),
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = await run(requested);
  } catch (e) {
    // A card / phone MAXMA doesn't know must not block the purchase: calculate anonymously
    if (e instanceof MaxmaError && e.notFound && client) {
      client = null;
      requested = 0;
      data = await run(0);
    } else {
      throw e;
    }
  }
  let r = data?.calculationResult;
  if (!r) throw new MaxmaError("unavailable", 502);

  const withCard = Boolean(client && "card" in client);
  // Asked for more than MAXMA allows (it may refuse instead of capping): ask again with its maximum
  if (withCard && requested > 0) {
    const max = Math.max(0, Math.floor(num(r.bonuses?.maxToApply)));
    const applied = Math.floor(num(r.bonuses?.applied));
    if (requested > max && applied < max) {
      requested = max;
      const again = (await run(requested))?.calculationResult;
      if (!again) throw new MaxmaError("unavailable", 502);
      r = again;
    }
  }

  const promo = promocode ? parsePromo(r, lines) : null;
  const none = lines.map(() => 0);
  if (!withCard) {
    await balanceP;
    return { promo, bonuses: null, bonusLines: none };
  }

  const b = r.bonuses ?? {};
  const promoLines = promo?.applied ? promo.lines : none;
  let bonusLines = none;
  let applied = 0;
  if (requested > 0) {
    const want = Math.min(requested, Math.floor(num(b.applied)));
    const byId = new Map<string, number>();
    for (const row of Array.isArray(r.rows) ? r.rows : []) byId.set(String(row?.id), num(row?.discounts?.bonuses));
    const split = splitBonusDiscount(lines.map((_, i) => byId.get(String(i)) ?? 0), want, lines.map((l) => l.total), promoLines);
    bonusLines = split.lines;
    applied = split.discount;
  }
  const fromCalc = r.clientBonuses?.available ?? data?.clientBonuses?.available;
  const balance = fromCalc != null && Number.isFinite(Number(fromCalc)) ? Number(fromCalc) : await balanceP;
  return {
    promo,
    bonuses: {
      balance,
      maxToApply: spendAllowed ? Math.max(0, Math.floor(num(b.maxToApply))) : 0,
      applied,
      collected: Math.max(0, Math.floor(num(b.collected))),
      ...(b.error?.description && requested > 0 ? { error: String(b.error.description) } : {}),
    },
    bonusLines,
  };
}

/** v2/set-order calculationQuery for the site order (card / phone, promo code, bonuses to reserve, accrual «auto»). */
export type SetOrderQuery = ReturnType<typeof loyaltyCalculationQuery>;

export function setOrderQuery(
  lines: PromoLine[],
  q: { customer: LoyaltyCustomer; promocode?: string | null; applyBonuses: number }
): SetOrderQuery {
  return loyaltyCalculationQuery(lines, { client: clientRef(q.customer), promocode: q.promocode, applyBonuses: q.applyBonuses, collect: true });
}

export type SetOrderResult = {
  /** Bonuses MAXMA reserved (calculationResult.bonuses.applied) */
  applied: number;
  collected: number;
  anonymous: boolean;
  /** Bonus discount per query row (rows[i].discounts.bonuses), for re-splitting when MAXMA reserves another amount */
  bonusRows: number[];
};

/**
 * v2/set-order «site-<id>» with a ready calculationQuery (see setOrderQuery). A card / phone
 * MAXMA doesn't know → sent again anonymously (promo code only), unless bonuses are spent:
 * those can't be reserved anonymously, the not-found error is thrown.
 */
export async function setLoyaltyOrderQuery(orderId: number, query: SetOrderQuery): Promise<SetOrderResult> {
  const send = async (calculationQuery: SetOrderQuery) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await call("v2/set-order", { orderId: `site-${orderId}`, calculationQuery });
    const r = data?.calculationResult ?? {};
    const b = r.bonuses ?? {};
    const byId = new Map<string, number>();
    for (const row of Array.isArray(r.rows) ? r.rows : []) byId.set(String(row?.id), num(row?.discounts?.bonuses));
    return {
      applied: Math.floor(num(b.applied)),
      collected: Math.floor(num(b.collected)),
      bonusRows: (query.rows ?? []).map((row) => byId.get(row.id) ?? 0),
    };
  };
  const hasClient = Boolean(query.client);
  try {
    return { ...(await send(query)), anonymous: !hasClient };
  } catch (e) {
    if (e instanceof MaxmaError && e.notFound && hasClient) {
      if (bonusAmount(query.applyBonuses) > 0) throw e; // spent bonuses can't be reserved anonymously
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { client: _client, ...anonymous } = query;
      return { ...(await send({ ...anonymous, applyBonuses: 0, collectBonuses: 0 })), anonymous: true };
    }
    throw e;
  }
}

/**
 * Registers / updates the site order «site-<id>» in MAXMA with the card, promo code, the
 * spent bonuses (MAXMA reserves them) and accrual «auto». A card MAXMA doesn't know →
 * anonymous order (only the promo code). Returns MAXMA's applied / collected for checks.
 */
export async function setLoyaltyOrder(
  orderId: number,
  lines: PromoLine[],
  q: { customer: LoyaltyCustomer; promocode?: string | null; applyBonuses: number }
): Promise<SetOrderResult> {
  return setLoyaltyOrderQuery(orderId, setOrderQuery(lines, q));
}
