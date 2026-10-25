import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { ADMIN_MANAGER, requireStaff } from "../_auth";

const ACTIVE_STATUSES = ["pending", "approved", "assembly", "consultation", "payment"];

// GET /api/team/dashboard — same data as app/admin/page.tsx
export async function GET() {
  const auth = await requireStaff(ADMIN_MANAGER);
  if (!auth.ok) return auth.response;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const week = new Date(today);
  week.setDate(week.getDate() - 7);

  const [
    todayCounts,
    activeCounts,
    recentOrders,
    todayRevenue,
    weekRevenue,
    newCustomersToday,
    totalCustomers,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: today, lt: tomorrow } },
      _count: { id: true },
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { status: { in: ACTIVE_STATUSES } },
      _count: { id: true },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true, companyName: true, phone: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        status: { not: "cancelled" },
      },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: week },
        status: { not: "cancelled" },
      },
      _sum: { total: true },
    }),
    prisma.customer.count({
      where: { createdAt: { gte: today, lt: tomorrow } },
    }),
    prisma.customer.count({
      where: { isApproved: true },
    }),
  ]);

  const todayByStatus: Record<string, number> = {};
  for (const c of todayCounts) todayByStatus[c.status] = c._count.id;
  const todayTotal = todayCounts.reduce((s, c) => s + c._count.id, 0);

  const activeCountMap: Record<string, number> = {};
  for (const c of activeCounts) activeCountMap[c.status] = c._count.id;
  const totalActive = activeCounts.reduce((s, c) => s + c._count.id, 0);

  return NextResponse.json({
    today: {
      ordersCount: todayTotal,
      revenue: todayRevenue._sum.total ?? 0,
      byStatus: todayByStatus,
    },
    active: {
      total: totalActive,
      byStatus: ACTIVE_STATUSES.map((status) => ({
        status,
        label: ORDER_STATUS_LABELS[status] ?? status,
        count: activeCountMap[status] ?? 0,
      })),
    },
    weekRevenue: weekRevenue._sum.total ?? 0,
    customers: {
      totalApproved: totalCustomers,
      newToday: newCustomersToday,
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status] ?? o.status,
      total: o.total,
      createdAt: o.createdAt.toISOString(),
      itemsCount: o._count.items,
      customer: o.customer,
      clientName: o.customer.companyName || o.customer.name || o.customer.phone || "—",
    })),
    statusLabels: ORDER_STATUS_LABELS,
  });
}
