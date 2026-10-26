import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../_auth";
import { findCard, maskPhone, MaxmaError, maxmaConfigured, maxmaPhone, publicCard, sendCode } from "@/lib/maxma";
import { RateLimiter } from "@/lib/rateLimit";

/**
 * Linking a MAXMA card in the app («Добавить карту»):
 *   POST { query }  — phone or card number → MAXMA texts a code to the card owner's phone
 *                     → { sent: true, phone: "+7 *** ***-12-34" }
 *   POST { code }   — the code from the SMS → card linked → { card }
 * Without the code anyone could attach a stranger's card by phone number and pay with their bonuses.
 */

type Pending = { card: string; hash: string; expiresAt: number; attempts: number };
const pending = new Map<number, Pending>();
const findLimiter = new RateLimiter({ windowMs: 15 * 60_000, max: 10 }); // SMS cost + enumeration
const codeLimiter = new RateLimiter({ windowMs: 15 * 60_000, max: 10 });

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const id = await currentCustomerId();
  if (!id) return bad("Нужно войти", 401);
  if (!maxmaConfigured()) return bad("Программа лояльности пока не подключена", 503);

  const body = (await request.json().catch(() => ({}))) as { query?: unknown; code?: unknown };

  // ── step 2: the code ──
  if (typeof body.code === "string" || typeof body.code === "number") {
    if (!codeLimiter.check(`c${id}`).ok) return bad("Слишком много попыток. Подождите 15 минут.", 429);
    const p = pending.get(id);
    if (!p || Date.now() > p.expiresAt) return bad("Код устарел — запросите новый");
    const code = String(body.code).replace(/\D/g, "");
    if (!code || !crypto.timingSafeEqual(Buffer.from(sha(code)), Buffer.from(p.hash))) {
      p.attempts++;
      if (p.attempts >= 5) pending.delete(id);
      return bad(p.attempts >= 5 ? "Слишком много неверных кодов — запросите новый" : "Неверный код");
    }
    pending.delete(id);
    codeLimiter.reset(`c${id}`);
    let card;
    try {
      card = await findCard({ card: p.card });
    } catch {
      return bad("Программа лояльности недоступна, попробуйте позже", 502);
    }
    if (!card) return bad("Карта не найдена", 404);
    await prisma.customer.update({ where: { id }, data: { loyaltyCard: card.number } });
    return NextResponse.json({ card: publicCard(card) });
  }

  // ── step 1: find the card and send the code ──
  const raw = typeof body.query === "string" ? body.query.trim() : "";
  if (!raw) return bad("Введите номер телефона или карты");
  if (!findLimiter.check(`f${id}`).ok) return bad("Слишком много попыток. Подождите 15 минут.", 429);

  const phone = maxmaPhone(raw);
  const cardNo = raw.replace(/\s/g, "");
  if (!phone && !/^[0-9A-Za-z-]{4,32}$/.test(cardNo)) return bad("Проверьте номер телефона или карты");

  try {
    // a phone-looking number could also be a card number — try both
    let card = phone ? await findCard({ phoneNumber: phone }) : null;
    if (!card) card = await findCard({ card: cardNo });
    if (!card) return bad("Карта не найдена. Проверьте номер или оформите карту в магазине.", 404);
    const sent = await sendCode(card.number);
    pending.set(id, { card: card.number, hash: sha(sent.code.replace(/\D/g, "")), expiresAt: sent.expiresAt, attempts: 0 });
    return NextResponse.json({ sent: true, phone: maskPhone(card.phone) });
  } catch (e) {
    const status = e instanceof MaxmaError ? e.status : 502;
    return bad("Программа лояльности недоступна, попробуйте позже", status === 404 ? 502 : status);
  }
}
