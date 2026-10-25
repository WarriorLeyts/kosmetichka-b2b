import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ONLY, requireStaff } from "../../_auth";
import { ROLE_LABELS, badId, notFound, parseId } from "../../_shared";

// GET /api/team/users/:id — app/admin/users/[id]/page.tsx (admin only, like the page)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff(ADMIN_ONLY);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const userId = parseId(id);
  if (!userId) return badId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { assignedOrders: true } },
    },
  });

  if (!user) return notFound();

  const isSelf = user.id === auth.session.id;

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] ?? user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      assignedOrdersCount: user._count.assignedOrders,
      isSelf,
      // The page hides "Удалить" for your own account
      canDelete: !isSelf,
    },
    roleOptions: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
  });
}
