import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Ожидание";
    case "approved":
      return "Подтвержден";
    case "exported":
      return "Выгружен в 1С";
    case "cancelled":
      return "Отменен";
    default:
      return status;
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-700";
    case "approved":
      return "bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-white";
    case "exported":
      return "bg-emerald-100 text-emerald-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

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

  const selectedDate = params.date || new Date().toISOString().slice(0, 10);
  const customerSearch = params.customer || "";
  const selectedStatus = params.status || "";

  const startDate = new Date(`${selectedDate}T00:00:00`);
  const endDate = new Date(`${selectedDate}T23:59:59`);

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
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
    orderBy: {
      createdAt: "desc",
    },
    include: {
      customer: true,
      items: true,
    },
  });

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Заказы</h1>

      <form className="mb-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Дата</label>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">
            Клиент / телефон
          </label>
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
            <option value="approved">Подтвержден</option>
            <option value="exported">Выгружен в 1С</option>
            <option value="cancelled">Отменен</option>
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-black px-5 py-2 text-white"
          >
            Найти
          </button>

          <Link href="/admin/orders" className="rounded-lg border px-5 py-2">
            Сегодня
          </Link>
        </div>
      </form>

      <div className="space-y-4">
        {orders.map((order) => (
          <Link
            href={`/admin/orders/${order.id}`}
            key={order.id}
            className="block rounded-xl border bg-white p-5 shadow-sm hover:bg-slate-50"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-semibold">Заказ №{order.id}</div>
                <div className="text-sm text-gray-500">
                  {new Date(order.createdAt).toLocaleString("ru-RU")}
                </div>
              </div>

              <div className="text-right">
                <div className="font-bold">{order.total} ₽</div>
                <span
                  className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(
                    order.status
                  )}`}
                >
                  {getStatusLabel(order.status)}
                </span>
              </div>
            </div>

            <div className="mb-4 text-sm">
              <div>
                Клиент:{" "}
                <span className="font-medium">
                  {order.customer.companyName ||
                    order.customer.name ||
                    order.customer.phone}
                </span>
              </div>
              <div>Телефон: {order.customer.phone}</div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Товар</th>
                    <th className="p-2 text-left">Штрихкод</th>
                    <th className="p-2 text-center">Кол-во</th>
                    <th className="p-2 text-right">Цена</th>
                    <th className="p-2 text-right">Сумма</th>
                  </tr>
                </thead>

                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">{item.productName}</td>
                      <td className="p-2">{item.barcode || "—"}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">{item.price} ₽</td>
                      <td className="p-2 text-right">{item.total} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {order.comment && (
              <div className="mt-3 text-sm text-gray-600">
                Комментарий: {order.comment}
              </div>
            )}
          </Link>
        ))}

        {orders.length === 0 && (
          <div className="rounded-xl border bg-white p-6 text-gray-500">
            Заказов по выбранным фильтрам нет
          </div>
        )}
      </div>
    </div>
  );
}