import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { staffSeesOrder } from "@/lib/staffScope";
import { refuseOrder, RefusalError } from "@/lib/orderRefusal";
import { notifyOrderStatus } from "@/lib/notify";

/** A staff member records the customer's refusal, including after export to 1C. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Неверный номер заказа" }, { status: 400 });
  if (!(await staffSeesOrder(user, id))) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  try {
    const result = await refuseOrder(id, Number(user.id));
    if (result.changed) void notifyOrderStatus(id, "cancelled");
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RefusalError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[order-refusal]", e);
    return NextResponse.json({ error: "Не удалось сохранить отказ. Попробуйте ещё раз." }, { status: 500 });
  }
}
