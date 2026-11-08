import { NextResponse } from "next/server";
import { ANY_STAFF, requireStaff } from "../_auth";
import { CUSTOMER_GROUPS, odataReady } from "@/lib/onecCustomers";

// GET /api/team/onec-groups — the 1С groups a customer can be given (the 8 the site gets from 1С)
export async function GET() {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ groups: CUSTOMER_GROUPS, canAssign: auth.session.role === "admin" && odataReady() });
}
