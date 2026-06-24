"use client";

import { useRouter } from "next/navigation";
import { Check, Lock, ShieldCheck, LogOut } from "lucide-react";
import Link from "next/link";

export function AdminCustomersClient({ customers }: { customers: any[] }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", {
      method: "POST",
    });

    router.push("/admin/login");
    router.refresh();
  }

  async function approveCustomer(id: number) {
    await fetch(`/api/admin/customers/${id}/approve`, {
      method: "POST",
    });

    router.refresh();
  }

  async function blockCustomer(id: number) {
    await fetch(`/api/admin/customers/${id}/block`, {
      method: "POST",
    });

    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-4xl font-black text-transparent">
            Клиенты B2B
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Подтверждение заявок и управление доступом
          </p>
        </div>

        <button
          onClick={logout}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <LogOut size={16} />
          Выход
        </button>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
  <table className="w-full border-collapse text-left text-sm">
    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
      <tr>
        <th className="px-5 py-4">Клиент</th>
        <th className="px-5 py-4">Контакты</th>
        <th className="px-5 py-4">Статус</th>
        <th className="px-5 py-4">Дата</th>
        <th className="px-5 py-4 text-right">Действие</th>
      </tr>
    </thead>

    <tbody>
      {customers.map((customer) => (
        <tr key={customer.id} className="border-t border-slate-100">
          <td className="px-5 py-4">
            <div className="font-black text-slate-800">{customer.name}</div>
            <div className="text-xs font-semibold text-slate-400">
              ID: {customer.id}
            </div>
          </td>

          <td className="px-5 py-4">
            <div className="font-semibold text-slate-700">{customer.email}</div>
            <div className="text-xs font-semibold text-slate-400">
              {customer.phone || "Телефон не указан"}
            </div>
          </td>

          <td className="px-5 py-4">
            {customer.isApproved ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-600">
                <ShieldCheck size={14} />
                Подтвержден
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">
                <Lock size={14} />
                Ожидает
              </span>
            )}
          </td>

          <td className="px-5 py-4 text-xs font-semibold text-slate-500">
            {new Date(String(customer.createdAt)).toLocaleDateString("ru-RU")}
          </td>

    <td className="px-5 py-4 text-right">
  <div className="flex justify-end gap-2">
    <Link
      href={`/admin/customers/${customer.id}`}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
    >
      Редактировать
    </Link>

    {customer.isApproved ? (
      <button
        onClick={() => blockCustomer(customer.id)}
        className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
      >
        Отключить
      </button>
    ) : (
      <button
        onClick={() => approveCustomer(customer.id)}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-4 py-2 text-xs font-black text-white"
      >
        <Check size={14} />
        Подтвердить
      </button>
    )}
  </div>
</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
      </div>
    </main>
  );
}