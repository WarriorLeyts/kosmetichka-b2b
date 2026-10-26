import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { toSmsAeroPhone } from "@/lib/phone";

/**
 * GET /api/mobile/loyalty — the signed-in customer's MAXMA loyalty card, found by phone.
 *
 * Env:
 *   MAXMA_API_KEY   — processing key from the MAXMA account (header X-Processing-Key)
 *   MAXMA_API_URL   — optional, default https://api.maxma.com (test: https://api-test.maxma.com)
 *   MAXMA_CASHBACK  — optional, cashback % by level name, e.g. «Базовый:3,Серебро:5,VIP:7»
 *
 * Answers: { card: {...} } | { card: null, reason: "not_configured" | "no_phone" | "not_found" }
 * The key never leaves the server.
 */

type Card = {
  number: string; // card number = barcode
  name: string;
  level: string | null;
  cashback: string | null;
  bonuses: number;
  pendingBonuses: number;
  nextLevelRemaining: number | null;
  progressPercent: number | null;
};

const cache = new Map<string, { at: number; card: Card | null }>();
const TTL = 60_000;

function cashbackFor(level: string | null): string | null {
  if (!level) return null;
  for (const pair of (process.env.MAXMA_CASHBACK ?? "").split(",")) {
    const [name, pct] = pair.split(":").map((s) => s?.trim());
    if (name && pct && name.toLowerCase() === level.toLowerCase()) return `${pct}%`;
  }
  return null;
}

export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const key = process.env.MAXMA_API_KEY;
  if (!key) return NextResponse.json({ card: null, reason: "not_configured" });

  const customer = await prisma.customer.findUnique({ where: { id }, select: { phone: true, name: true } });
  const phone = customer?.phone ? toSmsAeroPhone(customer.phone) : null;
  if (!phone) return NextResponse.json({ card: null, reason: "no_phone" });

  const hit = cache.get(phone);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json(hit.card ? { card: hit.card } : { card: null, reason: "not_found" });
  }

  const base = (process.env.MAXMA_API_URL || "https://api.maxma.com").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/get-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Processing-Key": key },
      body: JSON.stringify({ phoneNumber: `+${phone}` }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Программа лояльности недоступна, попробуйте позже" }, { status: 502 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    // MAXMA answers an error object when the client isn't in the program
    const notFound = res.status === 404 || /not.?found|не найден/i.test(JSON.stringify(data ?? ""));
    if (notFound) {
      cache.set(phone, { at: Date.now(), card: null });
      return NextResponse.json({ card: null, reason: "not_found" });
    }
    console.error("[maxma] get-balance", res.status, JSON.stringify(data)?.slice(0, 300));
    return NextResponse.json({ error: "Программа лояльности недоступна, попробуйте позже" }, { status: 502 });
  }

  const c = data?.client ?? {};
  const number = String(c.cardString || c.card || "").trim();
  if (!number) {
    cache.set(phone, { at: Date.now(), card: null });
    return NextResponse.json({ card: null, reason: "not_found" });
  }
  const level: string | null = data?.level?.name ?? null;
  const card: Card = {
    number,
    name: String(c.name || c.fullName || customer?.name || "").trim(),
    level,
    cashback: cashbackFor(level),
    bonuses: Number(c.bonuses) || 0,
    pendingBonuses: Number(c.pendingBonuses) || 0,
    nextLevelRemaining: data?.level?.remaining != null ? Number(data.level.remaining) : null,
    progressPercent: data?.level?.progressPercent != null ? Number(data.level.progressPercent) : null,
  };
  cache.set(phone, { at: Date.now(), card });
  return NextResponse.json({ card });
}
