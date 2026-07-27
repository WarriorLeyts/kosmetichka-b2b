import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import PrintButton from "@/components/admin/PrintButton";

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

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Auth guard
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/admin");
  if (!["admin", "manager"].includes(payload.role as string)) redirect("/admin");

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      items: {
        orderBy: { id: "asc" },
      },
    },
  });

  if (!order) notFound();

  const issueDate = new Date(order.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .invoice-wrap { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="no-print flex items-center gap-3 bg-slate-800 px-6 py-3">
        <a
          href={`/admin/orders/${order.id}`}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          ← Назад к заказу
        </a>
        <PrintButton />
        <span className="ml-auto text-sm text-slate-400">
          Счёт №{order.id} от {issueDate}
        </span>
      </div>

      {/* Invoice */}
      <div className="invoice-wrap mx-auto my-8 max-w-3xl rounded-2xl bg-white px-10 py-10 shadow-lg print:my-0 print:max-w-none print:shadow-none">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between border-b pb-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900">СЧЁТ</h1>
            <p className="mt-1 text-lg font-semibold text-slate-500">№{order.id}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p className="font-semibold text-slate-700">Дата выставления</p>
            <p>{issueDate}</p>
            <p className="mt-2 font-semibold text-slate-700">Статус заказа</p>
            <p>{STATUS_LABELS[order.status] ?? order.status}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Поставщик</p>
            <p className="font-bold text-slate-800">ООО «Косметичка»</p>
            <p className="text-sm text-slate-500">kosmetichka-opt.ru</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Покупатель</p>
            <p className="font-bold text-slate-800">
              {order.customer.companyName || order.customer.name || "—"}
            </p>
            {order.customer.inn && (
              <p className="text-sm text-slate-500">ИНН: {order.customer.inn}</p>
            )}
            {order.customer.phone && (
              <p className="text-sm text-slate-500">{order.customer.phone}</p>
            )}
            {order.customer.email && (
              <p className="text-sm text-slate-500">{order.customer.email}</p>
            )}
            {order.customer.city && (
              <p className="text-sm text-slate-500">{order.customer.city}</p>
            )}
            {order.customer.address && (
              <p className="text-sm text-slate-500">{order.customer.address}</p>
            )}
            {order.customer.manager && (
              <p className="mt-1 text-xs text-indigo-600 font-semibold">
                Менеджер: {order.customer.manager}
              </p>
            )}
          </div>
        </div>

        {/* Items table */}
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="pb-2 text-left font-semibold text-slate-500">№</th>
              <th className="pb-2 text-left font-semibold text-slate-500">Наименование</th>
              <th className="pb-2 text-center font-semibold text-slate-500">Кол-во</th>
              <th className="pb-2 text-right font-semibold text-slate-500">Цена, ₽</th>
              <th className="pb-2 text-right font-semibold text-slate-500">Сумма, ₽</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-2.5 pr-3 text-slate-400">{idx + 1}</td>
                <td className="py-2.5 pr-3">
                  <span className="font-medium text-slate-800">{item.productName}</span>
                  {item.variantName && (
                    <span className="ml-2 text-xs text-blue-600">🎨 {item.variantName}</span>
                  )}
                  {item.barcode && (
                    <span className="ml-2 font-mono text-xs text-slate-400">{item.barcode}</span>
                  )}
                </td>
                <td className="py-2.5 text-center text-slate-700">{item.quantity}</td>
                <td className="py-2.5 text-right text-slate-700">
                  {item.price.toLocaleString("ru-RU")}
                </td>
                <td className="py-2.5 text-right font-semibold text-slate-800">
                  {item.total.toLocaleString("ru-RU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between border-t-2 border-slate-800 pt-3">
              <span className="text-lg font-black text-slate-800">ИТОГО:</span>
              <span className="text-lg font-black text-slate-800">
                {order.total.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </div>
        </div>

        {/* Comment */}
        {order.comment && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <span className="font-semibold">Комментарий к заказу:</span> {order.comment}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 border-t pt-6 text-center text-xs text-slate-400">
          Счёт сформирован автоматически системой управления заказами kosmetichka-opt.ru
        </div>
      </div>

    </>
  );
}
