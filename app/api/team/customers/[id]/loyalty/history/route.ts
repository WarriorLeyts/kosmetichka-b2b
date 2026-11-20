import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../../../../_auth";
import { staffSeesCustomer } from "@/lib/staffScope";
import { getBonusHistory, maxmaConfigured } from "@/lib/maxma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный id" }, { status: 400 });
  if (!(await staffSeesCustomer(auth.session, id))) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  const c = await prisma.customer.findUnique({ where: { id }, select: { loyaltyCard: true } });
  if (!c) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  const offset = Number(sp.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return NextResponse.json({ error: "Неверная страница истории" }, { status: 400 });
  if (!c.loyaltyCard || sp.get("card") !== c.loyaltyCard) return NextResponse.json({ error: "Карта изменилась. Обновите данные." }, { status: 409 });
  if (!maxmaConfigured()) return NextResponse.json({ error: "MAXMA не подключена" }, { status: 503 });
  try {
    const history = await getBonusHistory(c.loyaltyCard, offset);
    const fresh = await prisma.customer.findUnique({ where: { id }, select: { loyaltyCard: true } });
    if (fresh?.loyaltyCard !== c.loyaltyCard) return NextResponse.json({ error: "Карта изменилась. Обновите данные." }, { status: 409 });
    return NextResponse.json({ ...history, offset, cardNumber: c.loyaltyCard });
  } catch { return NextResponse.json({ error: "Не удалось загрузить историю из MAXMA. Попробуйте ещё раз." }, { status: 502 }); }
}
