import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { parseCheckStatuses } from "@/lib/checkStatus";
import { ADMIN_MANAGER, requireStaff } from "../_auth";
import { CHECK_STATUS_LABELS, PRICE_TYPE_LABELS } from "../_shared";

const PERIOD_DAYS: Record<string, number | null> = {
  all: null,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

// GET /api/team/stats?period=all|30d|90d|365d — same data as app/admin/stats/page.tsx
export async function GET(request: NextRequest) {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const rawPeriod = request.nextUrl.searchParams.get("period") || "all";
  // Unknown values behave like "all" on the page; report the effective value
  const period = rawPeriod in PERIOD_DAYS ? rawPeriod : "all";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  const periodDay = PERIOD_DAYS[period] ?? null;
  const periodStart = periodDay
    ? new Date(Date.now() - periodDay * 24 * 60 * 60 * 1000)
    : null;
  const checkCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [
    todayCount,
    todayAgg,
    todayIssues,
    weekOrders,
    statusGroups,
    weekItems,
    allTimeAgg,
    checkRows,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: todayStart } },
    }),
    prisma.order.count({
      where: {
        createdAt: { gte: todayStart },
        items: { some: { check: { status: { not: "ok" } } } },
      },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: weekStart } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { status: { not: "exported" } },
    }),
    prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: weekStart } } },
      select: { productName: true, quantity: true, total: true },
    }),
    prisma.order.aggregate({
      _avg: { total: true },
      _count: { id: true },
      where: { status: { not: "cancelled" } },
    }),
    prisma.orderItemCheck.findMany({
      where: {
        orderItem: {
          order: { createdAt: { gte: checkCutoff } },
        },
      },
      select: { status: true },
      take: 10_000,
    }),
  ]);

  // Kept outside Promise.all (as on the page): groupBy + orderBy typing is heavy
  const topCustomerGroups = await prisma.order.groupBy({
    by: ["customerId"],
    _sum: { total: true },
    _count: { id: true },
    where: {
      status: { not: "cancelled" },
      ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
    },
    orderBy: { _sum: { total: "desc" } },
    take: 10,
  });

  // ── Last 7 days by day (keys are UTC dates, like the page) ──
  const dayMap: Record<string, { count: number; total: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    dayMap[d.toISOString().slice(0, 10)] = { count: 0, total: 0 };
  }
  for (const o of weekOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (dayMap[key]) {
      dayMap[key].count++;
      dayMap[key].total += o.total;
    }
  }

  // ── Status distribution (everything except exported) ──
  const statusTotal = statusGroups.reduce((s, x) => s + x._count.id, 0);
  const statusDistribution = [...statusGroups]
    .sort((a, b) => b._count.id - a._count.id)
    .map((g) => ({
      status: g.status,
      label: ORDER_STATUS_LABELS[g.status] ?? g.status,
      count: g._count.id,
      percent: statusTotal ? Math.round((g._count.id / statusTotal) * 100) : 0,
    }));

  // ── Top products this week (by quantity) ──
  const productMap: Record<string, { qty: number; revenue: number }> = {};
  for (const item of weekItems) {
    if (!productMap[item.productName]) productMap[item.productName] = { qty: 0, revenue: 0 };
    productMap[item.productName].qty += item.quantity;
    productMap[item.productName].revenue += item.total;
  }
  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10)
    .map(([productName, v]) => ({ productName, qty: v.qty, revenue: v.revenue }));

  // ── Top customers for the period ──
  const topCustomerData = await prisma.customer.findMany({
    where: { id: { in: topCustomerGroups.map((g) => g.customerId) } },
    select: { id: true, name: true, companyName: true, priceType: true },
  });
  const customerById = new Map(topCustomerData.map((c) => [c.id, c]));
  const topCustomers = topCustomerGroups.map((g) => {
    const c = customerById.get(g.customerId);
    const ordersCount = g._count.id;
    const totalSpent = g._sum.total ?? 0;
    return {
      customerId: g.customerId,
      displayName: c?.companyName || c?.name || `#${g.customerId}`,
      name: c?.name ?? null,
      companyName: c?.companyName ?? null,
      priceType: c?.priceType ?? null,
      priceTypeLabel: c?.priceType ? PRICE_TYPE_LABELS[c.priceType] ?? c.priceType : null,
      ordersCount,
      totalSpent,
      avgOrder: ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0,
    };
  });

  // ── Item-check results, last 90 days ──
  const checkStatusCounts: Record<string, number> = {};
  for (const row of checkRows) {
    for (const s of parseCheckStatuses(row.status)) {
      checkStatusCounts[s] = (checkStatusCounts[s] ?? 0) + 1;
    }
  }
  const totalChecks = Object.values(checkStatusCounts).reduce((s, c) => s + c, 0);

  return NextResponse.json({
    period,
    today: {
      ordersCount: todayCount,
      revenue: todayAgg._sum.total ?? 0,
      ordersWithIssues: todayIssues,
    },
    weekOrdersCount: weekOrders.length,
    avgOrderValue: Math.round(allTimeAgg._avg.total ?? 0),
    nonCancelledOrdersCount: allTimeAgg._count.id,
    week: Object.entries(dayMap).map(([date, v]) => ({ date, count: v.count, total: v.total })),
    statusDistribution,
    topCustomers,
    topProducts,
    checks: {
      total: totalChecks,
      byStatus: Object.entries(checkStatusCounts).map(([status, count]) => ({
        status,
        label: CHECK_STATUS_LABELS[status] ?? status,
        count,
        percent: totalChecks ? Math.round((count / totalChecks) * 100) : 0,
      })),
    },
  });
}
