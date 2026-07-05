import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getStatusLabel(status: string) {
  switch (status) {
    case "pending": return "Ожидание";
    case "assembly": return "Сборка";
    case "consultation": return "Консультация";
    case "payment": return "К оплате";
    case "exported": return "Выгружен";
    case "cancelled": return "Отменён";
    default: return status;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "pending": return "#eab308";
    case "assembly": return "#3b82f6";
    case "consultation": return "#f97316";
    case "payment": return "#22c55e";
    case "exported": return "#10b981";
    case "cancelled": return "#ef4444";
    default: return "#94a3b8";
  }
}

export default async function AdminStatsPage() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  // Today's stats
  const todayOrders = await prisma.order.findMany({
    where: { createdAt: { gte: todayStart } },
    include: { items: { include: { check: true } } },
  });

  const todayTotal = todayOrders.reduce((s, o) => s + o.total, 0);
  const todayIssues = todayOrders.filter((o) =>
    o.items.some((i) => i.check && i.check.status !== "ok")
  ).length;

  // Last 7 days — group by day
  const weekOrders = await prisma.order.findMany({
    where: { createdAt: { gte: weekStart } },
    orderBy: { createdAt: "asc" },
  });

  const dayMap: Record<string, { count: number; total: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { count: 0, total: 0 };
  }
  for (const o of weekOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    if (dayMap[key]) {
      dayMap[key].count++;
      dayMap[key].total += o.total;
    }
  }

  const days = Object.entries(dayMap);
  const maxCount = Math.max(...days.map(([, v]) => v.count), 1);

  // Status distribution (all time active)
  const statusGroups = await prisma.order.groupBy({
    by: ["status"],
    _count: { id: true },
    where: { status: { not: "exported" } },
  });

  // Top products this week
  const weekItems = await prisma.orderItem.findMany({
    where: { order: { createdAt: { gte: weekStart } } },
    select: { productName: true, quantity: true, total: true },
  });

  const productMap: Record<string, { qty: number; revenue: number }> = {};
  for (const item of weekItems) {
    if (!productMap[item.productName]) {
      productMap[item.productName] = { qty: 0, revenue: 0 };
    }
    productMap[item.productName].qty += item.quantity;
    productMap[item.productName].revenue += item.total;
  }
  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10);

  // Check issues stats
  const allChecks = await prisma.orderItemCheck.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const totalChecks = allChecks.reduce((s, c) => s + c._count.id, 0);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/orders" className="flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-slate-50">←</Link>
        <h1 className="text-2xl font-bold">Статистика</h1>
      </div>

      {/* Today cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-2xl font-black">{todayOrders.length}</div>
          <div className="text-sm text-slate-500">Заказов сегодня</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-2xl font-black">{todayTotal.toLocaleString("ru-RU")} ₽</div>
          <div className="text-sm text-slate-500">Выручка сегодня</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-2xl font-black">{weekOrders.length}</div>
          <div className="text-sm text-slate-500">За 7 дней</div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <div className={`text-2xl font-black ${todayIssues > 0 ? "text-orange-600" : "text-green-600"}`}>
            {todayIssues}
          </div>
          <div className="text-sm text-slate-500">С проблемами сегодня</div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {/* 7-day chart */}
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="mb-4 font-bold text-slate-700">Заказы за 7 дней</h2>
          <div className="flex items-end gap-1.5" style={{ height: 120 }}>
            {days.map(([date, val]) => {
              const h = Math.max((val.count / maxCount) * 100, val.count > 0 ? 8 : 2);
              const label = new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
              return (
                <div key={date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-xs font-bold text-slate-600">
                    {val.count > 0 ? val.count : ""}
                  </div>
                  <div
                    className="w-full rounded-t-lg bg-blue-500 transition-all"
                    style={{ height: `${h}%`, minHeight: val.count > 0 ? 6 : 2, opacity: val.count > 0 ? 1 : 0.2 }}
                  />
                  <div className="text-xs text-slate-400 whitespace-nowrap">{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status distribution */}
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="mb-4 font-bold text-slate-700">Активные заказы по статусу</h2>
          <div className="space-y-2">
            {statusGroups.length === 0 && (
              <div className="text-sm text-slate-400">Нет активных заказов</div>
            )}
            {statusGroups
              .sort((a, b) => b._count.id - a._count.id)
              .map((g) => {
                const total = statusGroups.reduce((s, x) => s + x._count.id, 0);
                const pct = total ? Math.round((g._count.id / total) * 100) : 0;
                return (
                  <div key={g.status} className="flex items-center gap-3">
                    <div className="w-24 text-sm font-semibold text-slate-600">
                      {getStatusLabel(g.status)}
                    </div>
                    <div className="flex-1 rounded-full bg-slate-100" style={{ height: 20 }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: getStatusColor(g.status),
                          minWidth: pct > 0 ? 24 : 0,
                        }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm font-bold">{g._count.id}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {/* Top products */}
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="mb-4 font-bold text-slate-700">Топ товаров за 7 дней</h2>
          <div className="space-y-2">
            {topProducts.length === 0 && (
              <div className="text-sm text-slate-400">Нет данных</div>
            )}
            {topProducts.map(([name, { qty, revenue }], idx) => (
              <div key={name} className="flex items-center gap-3">
                <div className="w-6 text-center text-sm font-black text-slate-300">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{name}</div>
                  <div className="text-xs text-slate-400">{revenue.toLocaleString("ru-RU")} ₽</div>
                </div>
                <div className="text-sm font-bold text-blue-600">{qty} шт.</div>
              </div>
            ))}
          </div>
        </div>

        {/* Check issues */}
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="mb-4 font-bold text-slate-700">Результаты проверок</h2>
          {totalChecks === 0 ? (
            <div className="text-sm text-slate-400">Проверок ещё не было</div>
          ) : (
            <div className="space-y-2">
              {allChecks.map((c) => {
                const pct = Math.round((c._count.id / totalChecks) * 100);
                const colors: Record<string, string> = {
                  ok: "#22c55e",
                  out_of_stock: "#ef4444",
                  expired: "#f97316",
                  bad_condition: "#eab308",
                  insufficient_qty: "#3b82f6",
                };
                const labels: Record<string, string> = {
                  ok: "ОК",
                  out_of_stock: "Нет в наличии",
                  expired: "Просрочен",
                  bad_condition: "Плохой вид",
                  insufficient_qty: "Не хватает",
                };
                return (
                  <div key={c.status} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-semibold text-slate-600 truncate">
                      {labels[c.status] || c.status}
                    </div>
                    <div className="flex-1 rounded-full bg-slate-100" style={{ height: 20 }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: colors[c.status] || "#94a3b8",
                          minWidth: 24,
                        }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm font-bold">{c._count.id}</div>
                  </div>
                );
              })}
              <div className="pt-2 text-xs text-slate-400 text-right">
                Всего проверок: {totalChecks}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
