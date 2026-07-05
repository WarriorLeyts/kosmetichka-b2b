import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PickerDashboard() {
  const orders = await prisma.order.findMany({
    where: {
      status: "assembly",
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      customer: true,
      items: {
        include: {
          check: true,
        },
      },
    },
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">Заказы на сборку</h1>

      {orders.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">
          Нет заказов на сборку
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const totalItems = order.items.length;
            const checkedItems = order.items.filter((i) => i.check).length;
            const hasIssues = order.items.some(
              (i) => i.check && i.check.status !== "ok"
            );
            const allChecked = checkedItems === totalItems && totalItems > 0;

            return (
              <Link
                href={`/picker/${order.id}`}
                key={order.id}
                className="block rounded-2xl border bg-white p-5 shadow-sm hover:bg-slate-50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-black">Заказ №{order.id}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {order.customer.companyName || order.customer.name || order.customer.phone}
                    </div>
                    <div className="text-sm text-slate-500">
                      {new Date(order.createdAt).toLocaleString("ru-RU")}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-600">
                      {totalItems} поз.
                    </div>
                    {checkedItems > 0 && (
                      <div className="mt-1 text-sm">
                        {allChecked ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              hasIssues
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {hasIssues ? "Есть проблемы" : "Всё ОК"}
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                            {checkedItems}/{totalItems} проверено
                          </span>
                        )}
                      </div>
                    )}
                    {checkedItems === 0 && (
                      <span className="mt-1 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-700">
                        Не начата
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  {order.items.slice(0, 3).map((item) => (
                    <span key={item.id} className="mr-2">
                      {item.productName} ×{item.quantity}
                    </span>
                  ))}
                  {order.items.length > 3 && (
                    <span className="text-slate-400">
                      +{order.items.length - 3} ещё
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
