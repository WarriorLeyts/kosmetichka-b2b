import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAdminRole } from "@/lib/auth";

type Props = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/customers/:id/stale { stale: true | false } — «Неактуальные»: the customer asked for wholesale
 * (sign-up or switch from retail) and changed his mind. Not approved, not blocked — set aside; a new
 * request (registering again, or asking for wholesale in the app) brings it back. false — back to requests.
 */
export async function POST(request: Request, { params }: Props) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (!(await requireAdminRole())) return NextResponse.json({ error: "Только администратор может подтверждать и изменять клиентов" }, { status: 403 });
  const customerId = Number((await params).id);
  if (!Number.isInteger(customerId) || customerId <= 0) return NextResponse.json({ error: "Неверный id" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (typeof body?.stale !== "boolean") return NextResponse.json({ error: "Нужно stale: true или false" }, { status: 400 });

  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { isApproved: true, requestStaleAt: true, roleRequestStatus: true },
  });
  if (!c) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const data: { requestStaleAt?: Date | null; roleRequestStatus?: string } = {};
  if (body.stale) {
    if (!c.isApproved && !c.requestStaleAt) data.requestStaleAt = new Date();
    if (c.roleRequestStatus === "pending") data.roleRequestStatus = "stale";
  } else {
    if (c.requestStaleAt) data.requestStaleAt = null;
    if (c.roleRequestStatus === "stale") data.roleRequestStatus = "pending";
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: body.stale ? "У клиента нет заявки" : "Заявка уже среди актуальных" }, { status: 409 });
  }
  await prisma.customer.update({ where: { id: customerId }, data });
  console.log(`[stale] customer ${customerId}: ${body.stale ? "set aside" : "back to requests"}`);
  return NextResponse.json({ success: true });
}
