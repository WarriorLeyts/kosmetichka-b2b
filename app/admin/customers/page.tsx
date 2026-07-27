import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const statusFilter = params.status || "";

  const customers = await prisma.customer.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { companyName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        statusFilter === "approved"
          ? { isApproved: true }
          : statusFilter === "pending"
          ? { isApproved: false }
          : statusFilter === "blocked"
          ? { isActive: false }
          : {},
      ],
    },
    select: {
      id: true,
      name: true,
      companyName: true,
      phone: true,
      email: true,
      inn: true,
      city: true,
      priceType: true,
      isActive: true,
      isApproved: true,
      manager: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const STATUS_FILTER_OPTIONS = [
    { value: "", label: "Все" },
    { value: "approved", label: "Подтверждённые" },
    { value: "pending", label: "Ожидают подтверждения" },
    { value: "blocked", label: "Заблокированные" },
  ];

  const PRICE_LABELS: Record<string, string> = {
    retail: "Розница",
    wholesale: "Опт",
    big_wholesale: "Крупный опт",
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Клиенты</h1>
        <span className="text-sm text-slate-400">{customers.length} записей</span>
      </div>

      {/* Filters */}
      <form className="mb-6 flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск по имени, компании, телефону, email"
          className="flex-1 min-w-48 rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-black px-5 py-2 text-sm font-bold text-white">
          Найти
        </button>
        <Link href="/admin/customers" className="rounded-xl border px-5 py-2 text-sm">
          Сброс
        </Link>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left font-semibold text-slate-600">Клиент</th>
              <th className="p-3 text-left font-semibold text-slate-600">Контакт</th>
              <th className="p-3 text-left font-semibold text-slate-600">Тип цены</th>
              <th className="p-3 text-center font-semibold text-slate-600">Статус</th>
              <th className="p-3 text-left font-semibold text-slate-600">Менеджер</th>
              <th className="p-3 text-left font-semibold text-slate-600">Дата</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-semibold">{c.companyName || c.name || "—"}</div>
                  {c.inn && <div className="text-xs text-slate-400">ИНН {c.inn}</div>}
                  {c.city && <div className="text-xs text-slate-400">{c.city}</div>}
                </td>
                <td className="p-3">
                  {c.phone && <div>{c.phone}</div>}
                  {c.email && <div className="text-xs text-slate-400">{c.email}</div>}
                </td>
                <td className="p-3 text-slate-600">
                  {PRICE_LABELS[c.priceType] ?? c.priceType}
                </td>
                <td className="p-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    {c.isApproved ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                        Подтверждён
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-700">
                        Ожидает
                      </span>
                    )}
                    {!c.isActive && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                        Заблокирован
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-slate-500 text-xs">{c.manager || "—"}</td>
                <td className="p-3 text-xs text-slate-400">
                  {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="p-3">
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    Изменить
                  </Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  Клиенты не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
