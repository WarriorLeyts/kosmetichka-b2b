import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { ExportButton } from "@/components/admin/ExportButton";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/admin/login");

  // Count and sum orders ready for export
  const [orders, aggregate] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["approved", "payment"] } },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true, companyName: true, phone: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.aggregate({
      where: { status: { in: ["approved", "payment"] } },
      _sum: { total: true },
    }),
  ]);

  const totalSum = aggregate._sum.total ?? 0;

  const STATUS_LABELS: Record<string, string> = {
    approved: "Подтверждён",
    payment: "К оплате",
  };
  const STATUS_COLORS: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    payment: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/orders"
          className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-50 text-slate-600"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Download size={20} className="text-indigo-500" />
          <h1 className="text-xl font-black text-slate-900">Выгрузка в 1С</h1>
        </div>
      </div>

      {/* Export button with confirmation */}
      <ExportButton orderCount={orders.length} totalSum={totalSum} />

      {/* Order list preview */}
      {orders.length > 0 && (
        <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-bold text-slate-700">
              Заказы в очереди на выгрузку
            </p>
          </div>
          <div className="divide-y max-h-[420px] overflow-y-auto">
            {orders.map((order) => {
              const clientName =
                order.customer.companyName ||
                order.customer.name ||
                order.customer.phone ||
                "—";
              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        #{order.id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          STATUS_COLORS[order.status] ??
                          "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {clientName} · {order._count.items} поз.
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-800">
                      {order.total.toLocaleString("ru-RU")} ₽
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
