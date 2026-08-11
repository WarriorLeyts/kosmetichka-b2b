import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import Link from "next/link";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 border-yellow-200 text-yellow-700",
  approved: "bg-green-50 border-green-200 text-green-700",
  assembly: "bg-blue-50 border-blue-200 text-blue-700",
  consultation: "bg-orange-50 border-orange-200 text-orange-700",
  payment: "bg-emerald-50 border-emerald-200 text-emerald-700",
  exported: "bg-slate-50 border-slate-200 text-slate-600",
  cancelled: "bg-red-50 border-red-200 text-red-700",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  approved: "✅",
  assembly: "📦",
  consultation: "💬",
  payment: "💳",
  exported: "🎉",
  cancelled: "❌",
};

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/admin/login");

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
    // Orders by status created today
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: today, lt: tomorrow } },
      _count: { id: true },
      _sum: { total: true },
    }),
    // Active (non-terminal) orders — all time
    prisma.order.groupBy({
      by: ["status"],
      where: { status: { in: ["pending", "approved", "assembly", "consultation", "payment"] } },
      _count: { id: true },
    }),
    // 10 most recent orders
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
    // Today's revenue (non-cancelled)
    prisma.order.aggregate({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        status: { not: "cancelled" },
      },
      _sum: { total: true },
    }),
    // Last 7 days revenue
    prisma.order.aggregate({
      where: {
        createdAt: { gte: week },
        status: { not: "cancelled" },
      },
      _sum: { total: true },
    }),
    // New customers today
    prisma.customer.count({
      where: { createdAt: { gte: today, lt: tomorrow } },
    }),
    // Total approved customers
    prisma.customer.count({
      where: { isApproved: true },
    }),
  ]);

  const todayCountMap: Record<string, number> = {};
  for (const c of todayCounts) todayCountMap[c.status] = c._count.id;
  const todayTotal = todayCounts.reduce((s, c) => s + c._count.id, 0);

  const activeCountMap: Record<string, number> = {};
  for (const c of activeCounts) activeCountMap[c.status] = c._count.id;
  const totalActive = activeCounts.reduce((s, c) => s + c._count.id, 0);

  const ACTIVE_STATUSES = ["pending", "approved", "assembly", "consultation", "payment"];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-800">Дашборд</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 mb-1">Заказов сегодня</p>
          <p className="text-3xl font-black text-slate-800">{todayTotal}</p>
          <p className="text-xs text-slate-400 mt-1">выручка {(todayRevenue._sum.total ?? 0).toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 mb-1">Активных заказов</p>
          <p className="text-3xl font-black text-indigo-600">{totalActive}</p>
          <p className="text-xs text-slate-400 mt-1">требуют обработки</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 mb-1">Выручка за 7 дней</p>
          <p className="text-3xl font-black text-emerald-600">{((weekRevenue._sum.total ?? 0) / 1000).toFixed(0)}к ₽</p>
          <p className="text-xs text-slate-400 mt-1">{(weekRevenue._sum.total ?? 0).toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 mb-1">Клиентов</p>
          <p className="text-3xl font-black text-slate-800">{totalCustomers}</p>
          <p className="text-xs text-slate-400 mt-1">+{newCustomersToday} сегодня</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Active pipeline */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-slate-700">Активные заказы по статусам</h2>
            <Link href="/admin/orders" className="text-xs font-semibold text-indigo-500 hover:underline">
              Все заказы →
            </Link>
          </div>
          <div className="divide-y">
            {ACTIVE_STATUSES.map((s) => {
              const count = activeCountMap[s] ?? 0;
              return (
                <Link
                  key={s}
                  href={`/admin/orders?status=${s}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition"
                >
                  <span className="text-lg">{STATUS_ICONS[s]}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-700">
                    {ORDER_STATUS_LABELS[s]}
                  </span>
                  {count > 0 ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black border ${STATUS_COLORS[s]}`}>
                      {count}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent orders */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-slate-700">Последние заказы</h2>
            <Link href="/admin/orders?date=" className="text-xs font-semibold text-indigo-500 hover:underline">
              Все →
            </Link>
          </div>
          <div className="divide-y">
            {recentOrders.map((order) => {
              const clientName = order.customer.companyName || order.customer.name || order.customer.phone || "—";
              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">#{order.id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${STATUS_COLORS[order.status] ?? "bg-slate-50 border-slate-200 text-slate-600"}`}>
                        {STATUS_ICONS[order.status]} {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{clientName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-800">{order.total.toLocaleString("ru-RU")} ₽</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(order.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Today's breakdown */}
      {todayTotal > 0 && (
        <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-bold text-slate-700">Заказы сегодня по статусам</h2>
          </div>
          <div className="flex flex-wrap gap-3 p-5">
            {Object.entries(todayCountMap).map(([s, count]) => (
              <Link
                key={s}
                href={`/admin/orders?status=${s}`}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-80 ${STATUS_COLORS[s] ?? "bg-slate-50 border-slate-200 text-slate-600"}`}
              >
                <span>{STATUS_ICONS[s] ?? "📋"}</span>
                <span>{ORDER_STATUS_LABELS[s] ?? s}</span>
                <span className="ml-1 rounded-full bg-white/60 px-2 py-0.5 text-xs font-black">{count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/admin/orders", label: "📋 Заказы" },
          { href: "/admin/customers", label: "👥 Клиенты" },
          { href: "/admin/stats", label: "📊 Статистика" },
          { href: "/admin/users", label: "🔐 Сотрудники" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border bg-white px-5 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
