import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCheckStatuses } from "@/lib/checkStatus";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { ADMIN_MANAGER, requireStaff } from "../_auth";
import { parsePage } from "../_shared";

const PAGE_SIZE = 50;

const PIPELINE_STATUSES = ["pending", "approved", "assembly", "consultation", "payment", "exported", "cancelled"];

/** Business-day range for "YYYY-MM-DD": previous day 19:00 … this day 18:59:59.999 (server local time) */
function businessDayRange(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const prevDayStr = d.toISOString().slice(0, 10);
  return {
    gte: new Date(`${prevDayStr}T19:00:00`),
    lte: new Date(`${dateStr}T18:59:59.999`),
  };
}

// GET /api/team/orders?date=&customer=&status=&page= — same list as app/admin/orders/page.tsx
export async function GET(request: NextRequest) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;

  // Same business-day logic as the page (cutoff 18:30 server time)
  const now = new Date();
  const calendarToday = now.toISOString().slice(0, 10);
  const isPastCutoff = now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 30);
  const businessToday = isPastCutoff
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : calendarToday;

  // date absent → business today; date="" → all dates; date="YYYY-MM-DD" → that business day
  const rawDate = sp.get("date");
  const selectedDate = rawDate !== null ? rawDate.trim() : businessToday;
  if (selectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return NextResponse.json({ error: "Неверная дата (ожидается YYYY-MM-DD)" }, { status: 400 });
  }
  const customerSearch = sp.get("customer") || "";
  const selectedStatus = sp.get("status") || "";
  const page = parsePage(sp.get("page"));

  const where: Prisma.OrderWhereInput = {
    ...(selectedDate ? { createdAt: businessDayRange(selectedDate) } : {}),
    status: selectedStatus || undefined,
    customer: customerSearch
      ? {
          OR: [
            { name: { contains: customerSearch, mode: "insensitive" } },
            { companyName: { contains: customerSearch, mode: "insensitive" } },
            { phone: { contains: customerSearch } },
            { inn: { contains: customerSearch } },
          ],
        }
      : undefined,
  };

  const [totalCount, orders, todayCounts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        status: true,
        total: true,
        promoCode: true,
        discount: true,
        bonusesApplied: true,
        bonusesCollected: true,
        createdAt: true,
        pickerId: true,
        customer: { select: { name: true, companyName: true, phone: true } },
        _count: { select: { items: true } },
        items: {
          select: { check: { select: { status: true } } },
        },
      },
    }),
    // Status chips — always for the current business day
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: businessDayRange(businessToday) },
      _count: { id: true },
    }),
  ]);

  const countMap: Record<string, number> = {};
  for (const c of todayCounts) countMap[c.status] = c._count.id;
  const todayTotal = Object.values(countMap).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status] ?? o.status,
      total: o.total,
      promoCode: o.promoCode ?? null,
      discount: o.discount,
      bonusesApplied: o.bonusesApplied,
      bonusesCollected: o.bonusesCollected,
      createdAt: o.createdAt.toISOString(),
      pickerId: o.pickerId,
      customer: o.customer,
      itemsCount: o._count.items,
      checkedCount: o.items.filter((i) => i.check).length,
      hasIssues: o.items.some((i) => {
        if (!i.check) return false;
        return parseCheckStatuses(i.check.status).some((s) => s !== "ok");
      }),
    })),
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    filters: {
      date: selectedDate,
      businessToday,
      customer: customerSearch,
      status: selectedStatus,
    },
    // Chips shown above the list: counts for the current business day
    todayCounts: {
      total: todayTotal,
      byStatus: PIPELINE_STATUSES.map((status) => ({
        status,
        label: ORDER_STATUS_LABELS[status] ?? status,
        count: countMap[status] ?? 0,
      })),
    },
  });
}
