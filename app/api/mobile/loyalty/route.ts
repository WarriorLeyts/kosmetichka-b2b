import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { findCard, maxmaConfigured, publicCard, type LoyaltyCard } from "@/lib/maxma";

/**
 * GET /api/mobile/loyalty — the customer's linked MAXMA card (fresh balance, cached 1 min).
 *   { card } | { card: null, reason: "not_configured" | "not_linked" }
 * DELETE /api/mobile/loyalty — unlink the card from this account.
 */

const cache = new Map<string, { at: number; card: LoyaltyCard | null }>();

export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const customer = await prisma.customer.findUnique({ where: { id }, select: { loyaltyCard: true, name: true } });
  const number = customer?.loyaltyCard;
  if (!number) return NextResponse.json({ card: null, reason: maxmaConfigured() ? "not_linked" : "not_configured" });
  // A newly issued cash-desk card can reach 1С before MAXMA. Show it immediately, without inventing a balance.
  const unavailable = () => NextResponse.json({ card: { number, name: customer?.name ?? "", level: null, cashback: null, bonuses: 0, pendingBonuses: 0, balanceUnavailable: true } });
  if (!maxmaConfigured()) return unavailable();

  const hit = cache.get(number);
  let card = hit && Date.now() - hit.at < 60_000 ? hit.card : undefined;
  if (card === undefined) {
    try {
      card = await findCard({ card: number });
    } catch {
      return unavailable();
    }
    cache.set(number, { at: Date.now(), card });
  }
  // the card was removed in MAXMA — show «Добавить карту» again
  if (!card) return unavailable();
  return NextResponse.json({ card: publicCard(card) });
}

export async function DELETE() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const customer = await prisma.customer.findUnique({ where: { id }, select: { loyaltyCard: true } });
  if (!customer) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  const changed = await prisma.customer.updateMany({ where: { id, loyaltyCard: customer.loyaltyCard }, data: { loyaltyCard: null, maxmaDiscount: false, maxmaRetail: false,
    ...(customer.loyaltyCard ? { loyaltyUnlinkedCards: { push: customer.loyaltyCard } } : {}),
  } });
  if (changed.count !== 1) return NextResponse.json({ error: "Привязка карты изменилась. Обновите профиль и повторите отвязку." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
