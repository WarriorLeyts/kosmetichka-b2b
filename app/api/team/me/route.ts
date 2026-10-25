import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ANY_STAFF, requireStaff } from "../_auth";
import { ROLE_LABELS } from "../_shared";

// GET /api/team/me — the logged-in staff user
export async function GET() {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;

  const user = await prisma.user.findUnique({
    where: { id: auth.session.id },
    select: { id: true, name: true, login: true, role: true, createdAt: true },
  });
  // Token is still valid but the account was deleted
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
    tokenRole: auth.session.role,
    createdAt: user.createdAt.toISOString(),
  });
}
