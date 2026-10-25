import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../../_auth";
import { PRICE_TYPE_LABELS, badId, notFound, parseId } from "../../_shared";

// GET /api/team/customers/:id — fields shown on app/admin/customers/[id]/page.tsx (password hash excluded)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const customerId = parseId(id);
  if (!customerId) return badId();

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      companyName: true,
      phone: true,
      email: true,
      inn: true,
      city: true,
      address: true,
      oneCId: true,
      manager: true,
      priceType: true,
      isActive: true,
      isApproved: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { orders: true } },
    },
  });

  if (!customer) return notFound();

  const { _count, ...rest } = customer;

  return NextResponse.json({
    customer: {
      ...rest,
      displayName: rest.companyName || rest.name || "—",
      priceTypeLabel: PRICE_TYPE_LABELS[rest.priceType] ?? rest.priceType,
      ordersCount: _count.orders,
      createdAt: rest.createdAt.toISOString(),
      updatedAt: rest.updatedAt.toISOString(),
    },
  });
}
