import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../_auth";

/**
 * The two questions right after signing up (app, owner's choice «Б», 2026-11-10): «Как вы узнали о нас?» and
 * «Вы уже заказывали у нас?». POST { source?: string, orderedBefore?: boolean } — «Пропустить» posts {}.
 * Either way surveyAt is set, so the app doesn't ask again. Staff see the answers on the customer's card.
 */
// the app offers: Instagram, WhatsApp, Друзья, знакомые, Увидел(а) магазин, 2ГИС / Яндекс, Другое (+ own text)

export async function POST(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const source = typeof body?.source === "string" ? body.source.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const orderedBefore = typeof body?.orderedBefore === "boolean" ? body.orderedBefore : null;
  await prisma.customer.update({
    where: { id },
    data: { referralSource: source || null, orderedBefore, surveyAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
