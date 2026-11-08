import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ONLY, requireStaff } from "../_auth";
import { ROLE_LABELS } from "../_shared";
import { assignableGroups } from "@/lib/staffScope";

// GET /api/team/users — staff list from app/admin/users/page.tsx (admin only, like the page)
export async function GET() {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;

  // Password intentionally excluded
  const users = await prisma.user.findMany({
    select: { id: true, name: true, login: true, role: true, oneCGroup: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      login: u.login,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] ?? u.role,
      oneCGroup: u.oneCGroup ?? null,
      createdAt: u.createdAt.toISOString(),
      isSelf: u.id === auth.session.id,
    })),
    totalCount: users.length,
    roleLabels: ROLE_LABELS,
    // 1С groups a manager account can get (its customers and their orders)
    groups: await assignableGroups(),
  });
}
