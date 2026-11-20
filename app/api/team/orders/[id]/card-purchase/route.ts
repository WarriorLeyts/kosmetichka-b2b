import { NextResponse } from "next/server";
import { requireStaff, ADMIN_MANAGER } from "../../../_auth";
import { staffSeesOrder } from "@/lib/staffScope";
import { lockedByOrderId } from "@/lib/orderLock";
import { CardPurchaseError, purchaseAssemblyCard } from "@/lib/assemblyCardPurchase";

export const POST = lockedByOrderId(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный id" }, { status: 400 });
  if (!await staffSeesOrder(auth.session, id)) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Нужен JSON" }, { status: 415 });
  const body = await request.json().catch(() => null);
  try { return NextResponse.json(await purchaseAssemblyCard(id, body?.registration, auth.session)); }
  catch (e) {
    if (e instanceof CardPurchaseError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && /ФИО|дат[уы] рождения|формате ДД/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[assembly-card] Purchase failed");
    return NextResponse.json({ error: "Не удалось добавить карту. Обновите заказ перед повтором." }, { status: 500 });
  }
});
