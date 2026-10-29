import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../_auth";
import { PRICE_TYPE_LABELS, parsePage } from "../_shared";

const PAGE_SIZE = 50;

// GET /api/team/customers?q=&status=&page= — same list as app/admin/customers/page.tsx
export async function GET(request: NextRequest) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const statusFilter = sp.get("status") || ""; // "" | "approved" | "pending" | "blocked"
  // price type: "retail" (розница + скидочная карта) | "wholesale" | "big_wholesale" | "" (all)
  const typeFilter = sp.get("type") || "";
  const page = parsePage(sp.get("page"));

  const where: Prisma.CustomerWhereInput = {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { companyName: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {},
      statusFilter === "approved"
        ? { isApproved: true }
        : statusFilter === "pending"
        ? { isApproved: false }
        : statusFilter === "blocked"
        ? { isActive: false }
        : statusFilter === "requests"
        ? { roleRequestStatus: "pending" }
        : {},
      typeFilter === "retail"
        ? { priceType: { in: ["retail", "discount"] } }
        : typeFilter === "wholesale" || typeFilter === "big_wholesale"
        ? { priceType: typeFilter }
        : {},
    ],
  };

  const [totalCount, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        companyName: true,
        phone: true,
        email: true,
        inn: true,
        city: true,
        priceType: true,
        roleRequest: true,
        roleRequestStatus: true,
        isActive: true,
        isApproved: true,
        manager: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      displayName: c.companyName || c.name || "—",
      priceTypeLabel: PRICE_TYPE_LABELS[c.priceType] ?? c.priceType,
      createdAt: c.createdAt.toISOString(),
    })),
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    filters: { q, status: statusFilter, type: typeFilter },
  });
}
