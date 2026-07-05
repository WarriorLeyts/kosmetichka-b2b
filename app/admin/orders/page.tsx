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

function getStatusClass(status: string) {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-700";
    case "assembly": return "bg-blue-100 text-blue-700";
    case "consultation": return "bg-orange-100 text-orange-700";
    case "payment": return "bg-green-100 text-green-700";
    case "exported": return "bg-emerald-100 text-emerald-700";
    case "cancelled": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    customer?: string;
    status?: string;
    all?: string;
  }>;
}) {
  const params = await searchParams;

  const showAll = params.all === "1";
  const selectedDate = params.date || new Date().toISOString().slice(0, 10);
  const customerSearch = params.customer || "";
  const selectedStatus = params.status || "";

  const startDate = new Date(`${selectedDate}T00:00:00`);
  const endDate = new Date(`${selectedDate}T23:59:59`);

  const orders = await prisma.order.findMany({
    where: {
      ...(showAll
        ? {}
        : {
            createdAt: { gte: startDate, lte: endDate },
          }),
      status: selectedStatus || undefined,
      customer: customerSearch
        ? {
            OR: [
              { name: { contains: customerSearch } },
              { companyName: { contains: customerSearch } },
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

  // Quick stats
  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Заказы</h1>
        <Link href="/admin/stats" className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          📊 Статистика
        </Link>
      </div>

      {/* Status chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span key={status} className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(status)}`}>
            {getStatusLabel(status)}: {count}
          </span>
        ))}
      </div>

      <form className="mb-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Дата</label>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            disabled={showAll}
            className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-50 disabled:text-slate-400"
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
            <option value="exported">Выгружен</option>
            <option value="cancelled">Отменён</option>
          </select>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <button type="submit" className="rounded-lg bg-black px-5 py-2 text-white">
            Найти
          </button>
          <Link href="/admin/orders" className="rounded-lg border px-4 py-2 text-sm">
            Сегодня
          </Link>
          <Link href="/admin/orders?all=1" className="rounded-lg border px-4 py-2 text-sm">
            Все
          </Link>
        </div>
      </form>

      <div className="space-y-3">
        {orders.map((order) => {
          const hasIssues = order.items.some(
            (i) => i.check && i.check.status !== "ok"
          );
          const checkedCount = order.items.filter((i) => i.check).length;

          return (
            <Link
              href={`/admin/orders/${order.id}`}
              key={order.id}
              className="block rounded-xl border bg-white p-4 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-lg">Заказ №{order.id}</div>
                    {order.status === "consultation" && hasIssues && (
                      <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                        ⚠ Проблемы
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {order.customer.companyName || order.customer.name || order.customer.phone}
                    {" · "}
                    {new Date(order.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-lg">{order.total.toLocaleString("ru-RU")} ₽</div>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${getStatusClass(order.status)}`}>
                    {getStatusLabel(order.status)}
                  </span>
                  {checkedCount > 0 && (
                    <div className="mt-1 text-xs text-slate-400">
                      Проверено: {checkedCount}/{order.items.length}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-3 text-sm text-slate-500">
                {order.items.slice(0, 4).map((item) => (
                  <span key={item.id}>
                    {item.productName} ×{item.quantity}
                    {item.check && item.check.status !== "ok" && (
                      <span className="ml-0.5 text-orange-500">⚠</span>
                    )}
                  </span>
                ))}
                {order.items.length > 4 && (
                  <span className="text-slate-400">+{order.items.length - 4} ещё</span>
                )}
              </div>
            </Link>
          );
        })}

        {orders.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
            Заказов не найдено
          </div>
        )}
      </div>
    </div>
  );
}
