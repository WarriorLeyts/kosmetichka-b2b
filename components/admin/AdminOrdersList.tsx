"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_STATUS_LABELS as STATUS_LABELS } from "@/lib/orderStatus";

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  assembly: "bg-blue-100 text-blue-700",
  consultation: "bg-orange-100 text-orange-700",
  payment: "bg-emerald-100 text-emerald-700",
  exported: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-100 text-red-700",
};

const BULK_STATUS_OPTIONS = [
  { value: "approved", label: "Подтвердить" },
  { value: "assembly", label: "Передать в сборку" },
  { value: "consultation", label: "Отправить на консультацию" },
  { value: "payment", label: "К оплате" },
  { value: "exported", label: "Выгружен в 1С" },
  { value: "cancelled", label: "Отменить" },
];

type OrderRow = {
  id: number;
  status: string;
  total: number;
  createdAt: string;
  customer: { name: string | null; companyName: string | null; phone: string | null };
  _count: { items: number };
  items: { check: { status: string } | null }[];
  hasIssues: boolean;
  checkedCount: number;
};

export function AdminOrdersList({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [applying, setApplying] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ updated: number; skipped: number } | null>(null);

  const allIds = orders.map((o) => o.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (selected.size === 0 || !bulkStatus) return;
    setApplying(true);
    setBulkResult(null);

    try {
      const res = await fetch("/api/admin/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selected), toStatus: bulkStatus }),
      });
      const data = await res.json();
      setBulkResult({
        updated: data.updated?.length ?? 0,
        skipped: data.skipped?.length ?? 0,
      });
      setSelected(new Set());
      setBulkStatus("");
      router.refresh();
    } catch {
      setBulkResult({ updated: 0, skipped: selected.size });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm font-bold text-indigo-700">
            Выбрано: {selected.size}
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">— Сменить статус —</option>
            {BULK_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={applyBulk}
            disabled={!bulkStatus || applying}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {applying ? "Применяем..." : "Применить"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-500 hover:text-slate-700 ml-auto"
          >
            Снять выбор
          </button>
        </div>
      )}

      {bulkResult && (
        <div className="mb-4 rounded-xl border bg-white px-4 py-3 text-sm">
          ✅ Обновлено: <strong>{bulkResult.updated}</strong>
          {bulkResult.skipped > 0 && (
            <span className="ml-3 text-amber-600">
              ⚠️ Пропущено: {bulkResult.skipped} (недопустимый переход статуса)
            </span>
          )}
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-3">
        {orders.length > 0 && (
          <div className="flex items-center gap-2 px-1 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-indigo-600"
            />
            <span>Выбрать все на странице</span>
          </div>
        )}

        {orders.map((order) => (
          <div key={order.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={selected.has(order.id)}
              onChange={() => toggleOne(order.id)}
              className="mt-5 h-4 w-4 flex-shrink-0 accent-indigo-600"
            />
            <Link
              href={`/admin/orders/${order.id}`}
              className="block flex-1 rounded-xl border bg-white p-5 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">Заказ №{order.id}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASSES[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    {order.hasIssues && (
                      <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                        ⚠ Проблемы
                      </span>
                    )}
                    {order.status === "assembly" && order.checkedCount > 0 && (
                      <span className="text-xs text-slate-400">
                        {order.checkedCount}/{order._count.items} проверено
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
                  <div className="text-xs text-slate-400">{order._count.items} позиций</div>
                </div>
              </div>
            </Link>
          </div>
        ))}

        {orders.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-slate-400">
            Заказов по выбранным фильтрам нет
          </div>
        )}
      </div>
    </div>
  );
}
