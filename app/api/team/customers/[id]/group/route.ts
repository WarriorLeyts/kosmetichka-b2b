import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ONLY, requireStaff } from "../../../_auth";
import { badId, parseId } from "../../../_shared";
import { assignCustomerGroup } from "@/lib/onecCustomers";

/**
 * POST /api/team/customers/:id/group { group } — admin: give the customer to a 1С group (manager).
 * In 1С the counterparty is moved to the group's folder, or created there for a new customer.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;
  const id = parseId((await params).id);
  if (!id) return badId();
  const body = await request.json().catch(() => ({}));
  const r = await assignCustomerGroup(id, String(body?.group ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
