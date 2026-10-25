import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCheckStatuses } from "@/lib/checkStatus";
import { ANY_STAFF, requireStaff } from "../../_auth";

// GET /api/team/picker/orders — same list as app/picker/page.tsx
// (all orders in "assembly"; mine first, then the rest, oldest first inside each group)
export async function GET() {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.session.id;

  const orders = await prisma.order.findMany({
    where: { status: "assembly" },
    select: {
      id: true,
      status: true,
      comment: true,
      pickerId: true,
      createdAt: true,
      picker: { select: { id: true, name: true } },
      customer: { select: { name: true, companyName: true, phone: true } },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          variantName: true,
          check: { select: { status: true } },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const sorted = [...orders].sort((a, b) => {
    const aIsMe = a.pickerId === currentUserId ? 0 : 1;
    const bIsMe = b.pickerId === currentUserId ? 0 : 1;
    if (aIsMe !== bIsMe) return aIsMe - bIsMe;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return NextResponse.json({
    currentUserId,
    orders: sorted.map((order) => {
      const itemsCount = order.items.length;
      const checkedCount = order.items.filter((i) => i.check).length;
      const hasIssues = order.items.some((i) => {
        if (!i.check) return false;
        return parseCheckStatuses(i.check.status).some((s) => s !== "ok");
      });
      const allChecked = checkedCount === itemsCount && itemsCount > 0;
      const progress: "not_started" | "in_progress" | "all_ok" | "has_issues" =
        checkedCount === 0
          ? "not_started"
          : !allChecked
          ? "in_progress"
          : hasIssues
          ? "has_issues"
          : "all_ok";

      return {
        id: order.id,
        status: order.status,
        comment: order.comment ?? null,
        createdAt: order.createdAt.toISOString(),
        pickerId: order.pickerId ?? null,
        picker: order.picker ?? null,
        isMine: order.pickerId === currentUserId,
        isAssignedToOther: order.pickerId !== null && order.pickerId !== currentUserId,
        customer: order.customer,
        clientName: order.customer.companyName || order.customer.name || order.customer.phone || "—",
        itemsCount,
        checkedCount,
        allChecked,
        hasIssues,
        progress,
        // The page previews the first 3 items and "+N ещё"
        itemsPreview: order.items.slice(0, 3).map((i) => ({
          id: i.id,
          productName: i.productName,
          variantName: i.variantName ?? null,
          quantity: i.quantity,
        })),
      };
    }),
  });
}
