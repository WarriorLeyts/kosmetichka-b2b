import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { findCard, MaxmaError, maxmaConfigured, publicCard, type LoyaltyCard } from "@/lib/maxma";

/**
 * GET /api/mobile/loyalty — the customer's linked MAXMA card (fresh balance, cached 1 min).
 *   { card } | { card: null, reason: "not_configured" | "not_linked" }
 * DELETE /api/mobile/loyalty — unlink the card from this account.
 */

const cache = new Map<string, { at: number; card: LoyaltyCard | null }>();

export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!maxmaConfigured()) return NextResponse.json({ card: null, reason: "not_configured" });

  const customer = await prisma.customer.findUnique({ where: { id }, select: { loyaltyCard: true } });
  const number = customer?.loyaltyCard;
  if (!number) return NextResponse.json({ card: null, reason: "not_linked" });

  const hit = cache.get(number);
  let card = hit && Date.now() - hit.at < 60_000 ? hit.card : undefined;
  if (card === undefined) {
    try {
      card = await findCard({ card: number });
    } catch (e) {
      const status = e instanceof MaxmaError ? e.status : 502;
      return NextResponse.json({ error: "Программа лояльности недоступна, попробуйте позже" }, { status });
    }
    cache.set(number, { at: Date.now(), card });
  }
  // the card was removed in MAXMA — show «Добавить карту» again
  if (!card) return NextResponse.json({ card: null, reason: "not_linked" });
  return NextResponse.json({ card: publicCard(card) });
}

export async function DELETE() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  await prisma.customer.update({ where: { id }, data: { loyaltyCard: null } });
  return NextResponse.json({ ok: true });
}
