import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидание",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "Консультация",
  payment: "К оплате",
  exported: "Выгружен в 1С",
  cancelled: "Отменён",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  assembly: "bg-blue-100 text-blue-700",
  consultation: "bg-orange-100 text-orange-700",
  payment: "bg-emerald-100 text-emerald-700",
  exported: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-100 text-red-700",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    customer?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;

  const selectedDate = params.date || "";
  const customerSearch = params.customer || "";
  const selectedStatus = params.status || "";

  const today = new Date().toISOString().slice(0, 10);

  let dateFilter = {};
  if (selectedDate) {
    const startDate = new Date(`${selectedDate}T00:00:00`);
    const endDate = new Date(`${selectedDate}T23:59:59`);
    dateFilter = { createdAt: { gte: startDate, lte: endDate } };
  }

  const orders = await prisma.order.findMany({
    where: {
      ...dateFilter,
      status: selectedStatus || undefined,
      customer: customerSearch
        ? {
            OR: [
              { name: { contains: customerSearch, mode: "insensitive" } },
              { companyName: { contains: customerSearch, mode: "insensitive" } },
              { phone: { contains: customerSearch } },
            ],
          }
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      items: {
        include: { check: true },
      },
    },
  });

  // Count by status (for today by default)
  const todayStart = new Date(`${today}T00:00:00`);
  const todayEnd = new Date(`${today}T23:59:59`);
  const todayCounts = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: todayStart, lte: todayEnd } },
    _count: { id: true },
  });
  const countMap: Record<string, number> = {};
  for (const c of todayCounts) countMap[c.status] = c._count.id;

  const PIPELINE_STATUSES = ["pending", "assembly", "consultation", "payment", "exported", "cancelled"];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Заказы</h1>
        <Link href="/admin/stats" className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50">
          📊 Статистика
        </Link>
      </div>

      {/* Status chips (today counts) */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/admin/orders?status=`}
          className={`rounded-full px-3 py-1 text-sm font-medium border transition-all ${
            !selectedStatus ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Все {Object.values(countMap).reduce((a, b) => a + b, 0) > 0
            ? `(${Object.values(countMap).reduce((a, b) => a + b, 0)})`
            : ""}
        </Link>
        {PIPELINE_STATUSES.map((s) => {
          const count = countMap[s] ?? 0;
          if (count === 0 && !["pending", "assembly", "consultation", "payment"].includes(s)) return null;
          return (
            <Link
              key={s}
              href={`/admin/orders?status=${s}`}
              className={`rounded-full px-3 py-1 text-sm font-medium border transition-all ${
                selectedStatus === s
                  ? "bg-slate-800 text-white border-slate-800"
                  : `${STATUS_CLASSES[s]} hover:opacity-80`
              }`}
            >
              {STATUS_LABELS[s]}{count > 0 ? ` (${count})` : ""}
              {s === "consultation" && count > 0 ? " ⚠️" : ""}
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <form className="mb-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Дата</label>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate || today}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Клиент / телефон</label>
          <input
            name="customer"
            defaultValue={customerSearch}
            placeholder="Поиск по клиенту"
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Статус</label>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="w-full rounded-lg border px-3 py-2"
          >
            <option value="">Все статусы</option>
            <option value="pending">Ожидание</option>
            <option value="assembly">Сборка</option>
            <option value="consultation">Консультация</option>
            <option value="payment">К оплате</option>
            <option value="exported">Выгружен в 1С</option>
            <option value="cancelled">Отменён</option>
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-black px-5 py-2 text-white">
            Найти
          </button>
          <Link href="/admin/orders" className="rounded-lg border px-5 py-2">
            Сегодня
          </Link>
          <Link href={`/admin/orders?date=`} className="rounded-lg border px-5 py-2">
            Все
          </Link>
        </div>
      </form>

      {/* Orders list */}
      <div className="space-y-3">
        {orders.map((order) => {
          const hasIssues = order.items.some((i) => i.check && i.check.status !== "ok");
          const checkedCount = order.items.filter((i) => i.check).length;

          return (
            <Link
              href={`/admin/orders/${order.id}`}
              key={order.id}
              className="block rounded-xl border bg-white p-5 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">Заказ №{order.id}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASSES[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    {hasIssues && (
                      <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                        ⚠ Проблемы
                      </span>
                    )}
                    {order.status === "assembly" && checkedCount > 0 && (
                      <span className="text-xs text-slate-400">
                        {checkedCount}/{order.items.length} проверено
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {new Date(order.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-medium">
                      {order.customer.companyName || order.customer.name || "—"}
                    </span>
                    {order.customer.phone && (
                      <span className="ml-2 text-slate-400">{order.customer.phone}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-black">{order.total.toLocaleString("ru-RU")} ₽</div>
                  <div className="text-xs text-slate-400">{order.items.length} позиций</div>
                </div>
              </div>
            </Link>
          );
        })}

        {orders.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-slate-400">
            Заказов по выбранным фильтрам нет
          </div>
        )}
      </div>
    </div>
  );
}
