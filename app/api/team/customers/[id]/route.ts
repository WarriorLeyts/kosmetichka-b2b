import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../../_auth";
import { PRICE_TYPE_LABELS, badId, notFound, parseId } from "../../_shared";
import { maxAccess } from "@/lib/roles";
import { SHOP_TYPE_LABELS, proofViewUrl, type ShopType } from "@/lib/proofs";
import { staffSeesCustomer } from "@/lib/staffScope";

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
  if (!(await staffSeesCustomer(auth.session, customerId))) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

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
      shopType: true,
      shopLink: true,
      proofs: { orderBy: { id: "asc" }, select: { id: true, kind: true, size: true, createdAt: true } },
      oneCId: true,
      manager: true,
      priceType: true,
      wholesaleAccess: true,
      showRetailPrice: true,
      roleRequest: true,
      roleRequestStatus: true,
      roleRequestedAt: true,
      isActive: true,
      isApproved: true,
      requestStaleAt: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { orders: true } },
    },
  });

  if (!customer) return notFound();

  const { _count, proofs, ...rest } = customer;

  return NextResponse.json({
    customer: {
      ...rest,
      displayName: rest.companyName || rest.name || "—",
      priceTypeLabel: PRICE_TYPE_LABELS[rest.priceType] ?? rest.priceType,
      wholesaleAccess: maxAccess(rest.wholesaleAccess, rest.priceType),
      roleRequestLabel: rest.roleRequest ? PRICE_TYPE_LABELS[rest.roleRequest] ?? rest.roleRequest : null,
      roleRequestedAt: rest.roleRequestedAt?.toISOString() ?? null,
      ordersCount: _count.orders,
      shopTypeLabel: rest.shopType ? SHOP_TYPE_LABELS[rest.shopType as ShopType] ?? rest.shopType : null,
      // wholesale proof: 1-hour links (images shown in the card, videos opened by URL)
      proofs: await Promise.all(proofs.map(async (p) => ({ id: p.id, kind: p.kind, size: p.size, createdAt: p.createdAt.toISOString(), url: await proofViewUrl(p.id) }))),
      createdAt: rest.createdAt.toISOString(),
      updatedAt: rest.updatedAt.toISOString(),
    },
  });
}
