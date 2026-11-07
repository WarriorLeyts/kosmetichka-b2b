import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_MANAGER, requireStaff } from "../_auth";
import { PRICE_TYPE_LABELS, parsePage } from "../_shared";

const PAGE_SIZE = 50;

/**
 * Status tiles. «Ожидают» — every request waiting for a decision: a new sign-up (опт / крупный опт) and a
 * customer asking for опт / крупный опт; blocked and «Неактуальные» are left out (staff set them aside;
 * a new request brings them back). «requests» (only the price-type requests) stays for older app versions.
 */
const STATUS_WHERE: Record<string, Prisma.CustomerWhereInput> = {
  pending: { isActive: true, OR: [{ isApproved: false, requestStaleAt: null }, { roleRequestStatus: "pending" }] },
  requests: { roleRequestStatus: "pending", isActive: true },
  approved: { isApproved: true, isActive: true },
  blocked: { isActive: false },
  stale: { isActive: true, OR: [{ isApproved: false, requestStaleAt: { not: null } }, { roleRequestStatus: "stale" }] },
};

// GET /api/team/customers?q=&status=&type=&from=&to=&page= — same list as app/admin/customers/page.tsx
export async function GET(request: NextRequest) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const statusFilter = sp.get("status") || ""; // "" | "pending" | "requests" | "approved" | "blocked" | "stale"
  // price type: "retail" (розница + скидочная карта) | "wholesale" | "big_wholesale" | "" (all)
  const typeFilter = sp.get("type") || "";
  const page = parsePage(sp.get("page"));
  // sign-up period: from / to as YYYY-MM-DD, whole Moscow days, both ends included (either may be missing)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") || "") ? sp.get("from")! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to") || "") ? sp.get("to")! : "";
  const mskDay = (d: string) => new Date(`${d}T00:00:00+03:00`);
  const period: Prisma.CustomerWhereInput =
    from || to
      ? { createdAt: { ...(from ? { gte: mskDay(from) } : {}), ...(to ? { lt: new Date(mskDay(to).getTime() + 24 * 3600 * 1000) } : {}) } }
      : {};

  const text: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { companyName: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  // the search and the period narrow everything: the list and every tile
  const search: Prisma.CustomerWhereInput = { AND: [text, period] };
  const byType = (t: string): Prisma.CustomerWhereInput =>
    t === "retail" ? { priceType: { in: ["retail", "discount"] } } : t === "wholesale" || t === "big_wholesale" ? { priceType: t } : {};
  const where: Prisma.CustomerWhereInput = { AND: [search, STATUS_WHERE[statusFilter] ?? {}, byType(typeFilter)] };

  // tiles: each status within the chosen type, each type within the chosen status (and the search)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const statusKeys = Object.keys(STATUS_WHERE);
  const typeKeys = ["retail", "wholesale", "big_wholesale"];
  const countsP = Promise.all([
    prisma.customer.count({ where: { AND: [search, byType(typeFilter)] } }),
    prisma.customer.count({ where: { AND: [search, byType(typeFilter), { createdAt: { gte: weekAgo } }] } }),
    ...statusKeys.map((k) => prisma.customer.count({ where: { AND: [search, byType(typeFilter), STATUS_WHERE[k]] } })),
    prisma.customer.count({ where: { AND: [search, STATUS_WHERE[statusFilter] ?? {}] } }),
    ...typeKeys.map((t) => prisma.customer.count({ where: { AND: [search, STATUS_WHERE[statusFilter] ?? {}, byType(t)] } })),
  ]);

  const [totalCount, customers, nums] = await Promise.all([
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
        requestStaleAt: true,
        manager: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    countsP,
  ]);
  const [all, newWeek, ...rest] = nums;
  const byStatus = Object.fromEntries(statusKeys.map((k, i) => [k, rest[i]]));
  const typesAll = rest[statusKeys.length];
  const byTypeCount = Object.fromEntries(typeKeys.map((t, i) => [t, rest[statusKeys.length + 1 + i]]));

  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      displayName: c.companyName || c.name || "—",
      priceTypeLabel: PRICE_TYPE_LABELS[c.priceType] ?? c.priceType,
      createdAt: c.createdAt.toISOString(),
      requestStaleAt: c.requestStaleAt?.toISOString() ?? null,
    })),
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    filters: { q, status: statusFilter, type: typeFilter, from, to },
    counts: { all, newWeek, byStatus, types: { all: typesAll, ...byTypeCount } },
  });
}
