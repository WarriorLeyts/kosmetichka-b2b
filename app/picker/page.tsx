import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getCurrentPickerId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "picker") return null;
    return payload.id as number;
  } catch {
    return null;
  }
}

export default async function PickerDashboard() {
  const currentPickerId = await getCurrentPickerId();

  const orders = await prisma.order.findMany({
    where: {
      status: "assembly",
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

  // Sort: assigned to current picker first, then unassigned, then assigned to others
  const sorted = [...orders].sort((a, b) => {
    const aIsMe = currentPickerId && a.pickerId === currentPickerId ? 0 : 1;
    const bIsMe = currentPickerId && b.pickerId === currentPickerId ? 0 : 1;
    if (aIsMe !== bIsMe) return aIsMe - bIsMe;
    // Within same group — oldest first
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-black">Заказы на сборку</h1>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">
          Нет заказов на сборку
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((order) => {
            const totalItems = order.items.length;
            const checkedItems = order.items.filter((i) => i.check).length;
            const hasIssues = order.items.some(
              (i) => i.check && i.check.status !== "ok"
            );
            const allChecked = checkedItems === totalItems && totalItems > 0;
            const isMyOrder = currentPickerId && order.pickerId === currentPickerId;
            const isAssignedToOther = order.pickerId && order.pickerId !== currentPickerId;

            return (
              <Link
                href={`/picker/${order.id}`}
                key={order.id}
                className={`block rounded-2xl border bg-white p-5 shadow-sm hover:bg-slate-50 ${
                  isMyOrder ? "border-blue-300 ring-1 ring-blue-200" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-black">Заказ №{order.id}</div>
                      {isMyOrder && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                          Мой заказ
                        </span>
                      )}
                      {isAssignedToOther && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          Назначен другому
                        </span>
                      )}
                    </div>
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
