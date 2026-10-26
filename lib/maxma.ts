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
