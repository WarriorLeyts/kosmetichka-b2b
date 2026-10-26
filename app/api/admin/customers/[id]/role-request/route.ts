import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { decideRoleRequest } from "@/lib/roleRequest";

type Props = { params: Promise<{ id: string }> };

/** POST /api/admin/customers/:id/role-request { action: "approve" | "reject" } — see lib/roleRequest.ts */
export async function POST(request: Request, { params }: Props) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Неверный id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }

  if (!(await decideRoleRequest(customerId, action))) {
    return NextResponse.json({ error: "Заявки нет" }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
