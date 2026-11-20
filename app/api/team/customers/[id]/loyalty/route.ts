import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, ADMIN_ONLY, requireStaff } from "../../../_auth";
import { staffSeesCustomer } from "@/lib/staffScope";
import { findStaffCard, maxmaConfigured, maxmaPhone } from "@/lib/maxma";
import { refreshMaxmaDiscount } from "@/lib/discountCard";

type Context = { params: Promise<{ id: string }> };
const select = { id: true, priceType: true, phone: true, loyaltyCard: true, maxmaDiscount: true, loyaltyAutoLinkDisabled: true } as const;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const conflict = () => bad("Карта аккаунта уже изменилась. Обновите данные и повторите действие.", 409);
const occupied = () => bad("Эта карта уже привязана к другому аккаунту. Сначала проверьте и отвяжите её в том аккаунте.", 409);
async function access(context: Context, write = false) {
  const auth = await requireStaff(write ? ADMIN_ONLY : ADMIN_MANAGER);
  if (!auth.ok) return { response: auth.response };
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return { response: bad("Неверный id") };
  if (!(await staffSeesCustomer(auth.session, id))) return { response: bad("Клиент не найден", 404) };
  const customer = await prisma.customer.findUnique({ where: { id }, select });
  if (!customer) return { response: bad("Клиент не найден", 404) };
  return { customer, session: auth.session };
}
export async function GET(_request: Request, context: Context) {
  const a = await access(context);
  if (a.response) return a.response;
  const { customer } = a;
  const base = { linkedNumber: customer.loyaltyCard, autoLinkDisabled: customer.loyaltyAutoLinkDisabled, discount: customer.maxmaDiscount, canManage: a.session.role === "admin" && ["retail", "discount"].includes(customer.priceType) };
  if (!customer.loyaltyCard) return NextResponse.json({ ...base, card: null });
  if (!maxmaConfigured()) return NextResponse.json({ ...base, card: null, warning: "MAXMA не подключена. Данные карты и баланс недоступны." });
  try {
    const card = await findStaffCard({ card: customer.loyaltyCard });
    return NextResponse.json({ ...base, card, ...(!card ? { warning: "Привязанный номер не найден в MAXMA. Привязка в аккаунте сохранена." } : {}) });
  } catch {
    return NextResponse.json({ ...base, card: null, warning: "MAXMA временно недоступна. Не удалось обновить данные карты." });
  }
}
const cardNumber = z.string().trim().min(1).max(64).regex(/^[0-9A-Za-z-]+$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lookup"), query: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal("link"), cardNumber, expectedCard: z.string().nullable() }),
  z.object({ action: z.literal("unlink"), expectedCard: z.string().nullable() }),
]);
export async function POST(request: Request, context: Context) {
  const a = await access(context, true);
  if (a.response) return a.response;
  if (!request.headers.get("content-type")?.includes("application/json")) return bad("Нужен JSON", 415);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("Проверьте номер карты или телефона и обновите данные аккаунта.");
  const { customer, session } = a; const body = parsed.data;
  if (!["retail", "discount"].includes(customer.priceType)) return bad("Управление картой доступно для розничного аккаунта.", 409);
  let next: string | null = null;
  if (body.action !== "unlink") {
    if (!maxmaConfigured()) return bad("MAXMA не подключена", 503);
    try {
      const phone = body.action === "lookup" ? maxmaPhone(body.query) : null;
      let card = phone ? await findStaffCard({ phoneNumber: phone }) : null;
      const number = (body.action === "lookup" ? body.query : body.cardNumber).replace(/\s/g, "");
      if (!card && !cardNumber.safeParse(number).success) return bad("Проверьте номер карты или телефона");
      if (!card) card = await findStaffCard({ card: number });
      if (!card) return bad("Карта не найдена в MAXMA", 404);
      const other = await prisma.customer.findFirst({ where: { loyaltyCard: card.number, NOT: { id: customer.id } }, select: { id: true } });
      if (other) return occupied();
      if (body.action === "lookup") return NextResponse.json({ card, phoneMatches: Boolean(maxmaPhone(customer.phone ?? "") && maxmaPhone(customer.phone ?? "") === maxmaPhone(card.phone ?? "")) });
      next = card.number;
    } catch { return bad("MAXMA временно недоступна. Карта аккаунта не изменена.", 502); }
  }
  if (customer.loyaltyCard !== body.expectedCard) {
    if (customer.loyaltyCard === next && (next !== null || customer.loyaltyAutoLinkDisabled)) return NextResponse.json({ ok: true });
    return conflict();
  }
  try {
    const changed = await prisma.$transaction(async tx => {
      const result = await tx.customer.updateMany({ where: { id: customer.id, loyaltyCard: body.expectedCard, priceType: customer.priceType, loyaltyAutoLinkDisabled: customer.loyaltyAutoLinkDisabled },
        data: { loyaltyCard: next, maxmaDiscount: false, loyaltyAutoLinkDisabled: next === null } });
      if (!result.count) return false;
      await tx.adminAuditLog.create({ data: { userId: session.id, userName: session.login, action: next ? "loyalty.link" : "loyalty.unlink", entity: "customer", entityId: String(customer.id),
        summary: next ? `Привязана карта MAXMA к аккаунту №${customer.id}` : `Отвязана карта MAXMA от аккаунта №${customer.id}`,
        before: { loyaltyCard: customer.loyaltyCard, maxmaDiscount: customer.maxmaDiscount }, after: { loyaltyCard: next, autoLinkDisabled: next === null } } });
      return true;
    });
    if (!changed) return conflict();
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return occupied();
    throw e;
  }
  if (next) await refreshMaxmaDiscount(customer.id).catch(() => false);
  return NextResponse.json({ ok: true });
}
