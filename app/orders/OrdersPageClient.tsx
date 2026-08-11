"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { OrderChat } from "@/components/orders/OrderChat";
import { getProductImageUrl } from "@/lib/renderMsgContent";
import { ORDER_STATUS_LABELS_CUSTOMER as STATUS_LABELS } from "@/lib/orderStatus";

const ALL_STATUSES = [
  { value: "", label: "Все статусы" },
  { value: "pending", label: "Ожидает подтверждения" },
  { value: "approved", label: "Подтверждён" },
  { value: "assembly", label: "Сборка" },
  { value: "consultation", label: "Консультация" },
  { value: "payment", label: "К оплате" },
  { value: "exported", label: "Выполнен" },
  { value: "cancelled", label: "Отменён" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  assembly: "bg-blue-100 text-blue-800 border border-blue-200",
  consultation: "bg-orange-100 text-orange-800 border border-orange-200",
  payment: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  exported: "bg-slate-100 text-slate-600 border border-slate-200",
  cancelled: "bg-red-100 text-red-700 border border-red-200",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  approved: "✅",
  assembly: "📦",
  consultation: "💬",
  payment: "💳",
  exported: "🎉",
  cancelled: "❌",
};

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  total: number;
  imagePath?: string | null;      // raw product image path (no /1c/ prefix)
  variantImageUrl?: string | null; // full path /1c/... or http... — use directly in <img>
  variantName?: string | null;
};

type ChangeItem = { productName: string; quantity?: number; price: number; variantName?: string | null };
type ChangedItem = { productName: string; oldQty: number; newQty: number; price: number; variantName?: string | null };
type ChangesSnapshot = {
  added: ChangeItem[];
  removed: ChangeItem[];
  changed: ChangedItem[];
} | null;

type Order = {
  id: number;
  status: string;
  total: number;
  comment?: string | null;
  createdAt: string;
  customerConfirmed: boolean;
  changesSnapshot: ChangesSnapshot;
  items: OrderItem[];
};

type Message = {
  id: number;
  text: string;
  isFromManager: boolean;
  createdAt: string;
};

type Stats = {
  totalOrders: number;
  totalSum: number;
  topProduct: string | null;
  topProductQty: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(amount: number) {
  return amount.toLocaleString("ru-RU") + " ₽";
}

const IMAGES_BASE = process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? "https://kosmetichka-opt.ru";

type EditableItem = {
  id: number;
  productName: string;
  quantity: number;
  price: number;
  imagePath?: string | null;
  variantImageUrl?: string | null;
  variantName?: string | null;
  removed: boolean;
};

function OrderCard({ order: initialOrder }: { order: Order }) {
  const [order, setOrder] = useState(initialOrder);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [repeating, setRepeating] = useState(false);
  const repeatOrder = useCartStore((s) => s.repeatOrder);

  // ── Inline edit (pending only) ──
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const label = STATUS_LABELS[order.status] ?? order.status;
  const colorClass = STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-700";
  const needsConfirm = order.status === "consultation" && !order.customerConfirmed;

  async function confirmOrder() {
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch(`/api/orders/${order.id}/confirm`, { method: "POST" });
      if (res.ok) {
        setOrder((prev) => ({ ...prev, customerConfirmed: true }));
      } else {
        const data = await res.json();
        setConfirmError(data.error || "Ошибка подтверждения");
      }
    } catch {
      setConfirmError("Ошибка сети");
    } finally {
      setConfirming(false);
    }
  }

  function startEdit() {
    setEditItems(
      order.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        quantity: i.quantity,
        price: i.price,
        imagePath: i.imagePath ?? null,
        variantImageUrl: i.variantImageUrl ?? null,
        variantName: i.variantName ?? null,
        removed: false,
      }))
    );
    setEditMode(true);
    setSaveError("");
  }

  function cancelEdit() {
    setEditMode(false);
    setEditItems([]);
    setSaveError("");
  }

  async function saveEdit() {
    const updates = editItems
      .filter((i) => !i.removed)
      .map((i) => ({ id: i.id, quantity: i.quantity }));
    const removeIds = editItems.filter((i) => i.removed).map((i) => i.id);

    if (updates.length === 0) {
      setSaveError("В заказе должна остаться хотя бы одна позиция");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/orders/${order.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updates, removeIds }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrder((prev) => ({
          ...prev,
          total: data.order.total,
          items: data.order.items,
        }));
        setEditMode(false);
        setEditItems([]);
      } else {
        setSaveError(data.error || "Ошибка сохранения");
      }
    } catch {
      setSaveError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  const icon = STATUS_ICONS[order.status] ?? "📋";

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-white/60 overflow-hidden" style={{ boxShadow: "0 2px 16px rgba(168,85,247,0.06), 0 1px 4px rgba(0,0,0,0.05)" }}>
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50/50 transition"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-50 to-purple-50 text-xl border border-purple-100 flex-shrink-0">
            {icon}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-slate-800">Заказ №{order.id}</span>
            <span className="text-xs text-slate-400 font-medium">
              {formatDate(order.createdAt)} · {formatMoney(order.total)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${colorClass}`}>{label}</span>
          <span className="text-slate-300 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {needsConfirm && (
        <div className="mx-5 mb-3 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-sm font-medium text-orange-800 mb-3">
            {"\u{1F4CB} Менеджер изменил состав заказа. Пожалуйста, подтвердите изменения."}
          </p>

          {/* ── Changes diff ── */}
          {order.changesSnapshot && (
            <div className="mb-3 flex flex-col gap-2 text-xs">
              {order.changesSnapshot.added.length > 0 && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <p className="font-bold text-green-700 mb-1">✅ Добавлено</p>
                  <div className="flex flex-col gap-0.5">
                    {order.changesSnapshot.added.map((item, i) => (
                      <div key={i} className="flex items-baseline gap-1 text-green-800">
                        <span className="font-medium truncate flex-1">{item.productName}{item.variantName ? ` (${item.variantName})` : ""}</span>
                        <span className="shrink-0 text-green-600">× {item.quantity ?? 1} шт. · {formatMoney((item.quantity ?? 1) * item.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {order.changesSnapshot.removed.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <p className="font-bold text-red-700 mb-1">🗑 Удалено</p>
                  <div className="flex flex-col gap-0.5">
                    {order.changesSnapshot.removed.map((item, i) => (
                      <div key={i} className="flex items-baseline gap-1 text-red-800">
                        <span className="font-medium truncate flex-1 line-through">{item.productName}{item.variantName ? ` (${item.variantName})` : ""}</span>
                        <span className="shrink-0 text-red-500">× {item.quantity ?? 1} шт.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {order.changesSnapshot.changed.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="font-bold text-amber-700 mb-1">✏️ Изменено количество</p>
                  <div className="flex flex-col gap-0.5">
                    {order.changesSnapshot.changed.map((item, i) => (
                      <div key={i} className="flex items-baseline gap-1 text-amber-800">
                        <span className="font-medium truncate flex-1">{item.productName}{item.variantName ? ` (${item.variantName})` : ""}</span>
                        <span className="shrink-0 text-amber-600">{item.oldQty} → {item.newQty} шт.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {confirmError && <p className="text-xs text-red-600 mb-2">{confirmError}</p>}
          <button
            onClick={confirmOrder}
            disabled={confirming}
            className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {confirming ? "Подтверждаем…" : "✓ Подтвердить изменения"}
          </button>
        </div>
      )}

      {!needsConfirm && order.customerConfirmed && order.status === "consultation" && (
        <div className="mx-5 mb-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-700">{"✓ Вы подтвердили изменения"}</p>
        </div>
      )}

      {expanded && (
        <div className="border-t px-5 py-4">

          {/* Edit mode UI */}
          {editMode ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-bold text-amber-800 text-sm">Редактирование заказа</span>
                <div className="flex gap-2">
                  <button
                    onClick={cancelEdit}
                    className="rounded-xl border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-amber-100"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? "Сохранение..." : "✓ Сохранить"}
                  </button>
                </div>
              </div>
              {saveError && (
                <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-200">
                  {saveError}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {editItems.map((item, idx) => {
                  const imgSrc = item.variantImageUrl
                    ? (item.variantImageUrl.startsWith("http") ? item.variantImageUrl : `${IMAGES_BASE}${item.variantImageUrl}`)
                    : item.imagePath
                    ? getProductImageUrl(item.imagePath)
                    : null;
                  if (item.removed) {
                    return (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 opacity-60">
                        <span className="flex-1 text-xs line-through text-red-600 truncate">{item.productName}</span>
                        <button
                          onClick={() => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, removed: false } : i))}
                          className="text-xs text-red-600 hover:underline shrink-0"
                        >
                          Восстановить
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border bg-white p-2">
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.productName} className="h-10 w-10 rounded-lg border object-contain p-0.5 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="h-10 w-10 rounded-lg border bg-slate-100 flex items-center justify-center text-lg shrink-0">🧴</div>
                      )}
                      <span className="flex-1 text-xs font-medium truncate">{item.productName}</span>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, quantity: Math.max(1, Number(e.target.value)) } : i))}
                        className="w-14 rounded-lg border px-2 py-1 text-center text-sm"
                      />
                      <span className="text-xs text-slate-400 shrink-0">шт.</span>
                      <span className="text-xs font-semibold text-slate-700 shrink-0 min-w-[60px] text-right">
                        {formatMoney(item.price * item.quantity)}
                      </span>
                      <button
                        onClick={() => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, removed: true } : i))}
                        className="rounded-lg border px-2 py-1 text-xs text-red-500 hover:bg-red-50 shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-right text-sm font-bold text-slate-700">
                Итого:{" "}
                {formatMoney(
                  editItems.filter((i) => !i.removed).reduce((sum, i) => sum + i.price * i.quantity, 0)
                )}
              </div>
            </div>
          ) : (
            /* Edit button for pending orders */
            order.status === "pending" && (
              <div className="mb-3">
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  ✏️ Редактировать заказ
                </button>
              </div>
            )
          )}

          {/* Items list (shown when not in edit mode) */}
          {!editMode && (
            <>
              <div className="flex flex-col gap-3">
                {order.items.map((item) => {
                  // variantImageUrl already has /1c/ prefix — use directly
                  // imagePath is a raw path — needs /api/1c/ prepended
                  const imgSrc = item.variantImageUrl
                    ? (item.variantImageUrl.startsWith("http")
                        ? item.variantImageUrl
                        : `${IMAGES_BASE}${item.variantImageUrl}`)
                    : item.imagePath
                    ? getProductImageUrl(item.imagePath)
                    : null;
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      {imgSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgSrc}
                          alt={item.productName}
                          className="h-12 w-12 rounded-lg object-contain border bg-white p-0.5"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border bg-slate-100 flex items-center justify-center text-xl">{"\u{1F9F4}"}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800 truncate">{item.productName}</p>
                        {item.variantName && (
                          <p className="text-xs font-semibold text-purple-600">🎨 {item.variantName}</p>
                        )}
                        {item.barcode && <p className="text-xs text-slate-400">{item.barcode}</p>}
                      </div>
                      <div className="text-right text-sm text-slate-700 shrink-0">
                        <p>{item.quantity} {"шт."}</p>
                        <p className="text-slate-500">{formatMoney(item.total)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {order.comment && (
                <p className="mt-3 text-sm text-slate-500 italic">{"Комментарий: "}{order.comment}</p>
              )}
            </>
          )}

          <OrderChat orderId={order.id} />

          {/* ── Action buttons ── */}
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {/* Invoice */}
            <a
              href={`/orders/${order.id}/invoice`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              🧾 Накладная
            </a>

            {/* Excel export */}
            <a
              href={`/api/orders/${order.id}/export`}
              download
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition"
            >
              📊 Скачать Excel
            </a>

            {/* Repeat order */}
            <button
              onClick={() => {
                setRepeating(true);
                repeatOrder(
                  order.items.map((i) => ({
                    productId: i.productId,
                    productName: i.productName,
                    quantity: i.quantity,
                    price: i.price,
                    barcode: i.barcode,
                    variantName: i.variantName,
                    variantImageUrl: i.variantImageUrl,
                    imagePath: i.imagePath,
                  }))
                );
                setTimeout(() => setRepeating(false), 3000);
              }}
              disabled={repeating}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-60"
            >
              {repeating ? "✓ Добавлено в корзину" : "🔁 Повторить заказ"}
            </button>
            {repeating && (
              <p className="w-full text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 mt-1">
                ⚠️ Цены будут пересчитаны по вашему прайсу при оформлении заказа
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersFilterBar({
  currentStatus,
  currentDateFrom,
  currentDateTo,
}: {
  currentStatus: string;
  currentDateFrom: string;
  currentDateTo: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [dateFrom, setDateFrom] = useState(currentDateFrom);
  const [dateTo, setDateTo] = useState(currentDateTo);

  function apply() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo)   params.set("dateTo", dateTo);
    const qs = params.toString();
    router.push(qs ? `/orders?${qs}` : "/orders");
  }

  function reset() {
    setStatus("");
    setDateFrom("");
    setDateTo("");
    router.push("/orders");
  }

  const hasFilter = currentStatus || currentDateFrom || currentDateTo;

  return (
    <div className="mb-4 rounded-2xl bg-white border shadow-sm p-4 flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label className="text-xs font-semibold text-slate-500">Статус</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">С даты</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500">По дату</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <button
        onClick={apply}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition"
      >
        Найти
      </button>
      {hasFilter && (
        <button
          onClick={reset}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}

export default function OrdersPageClient({
  orders,
  stats,
  currentStatus = "",
  currentDateFrom = "",
  currentDateTo = "",
}: {
  orders: Order[];
  stats: Stats;
  currentStatus?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
}) {
  const hasFilter = currentStatus || currentDateFrom || currentDateTo;

  if (orders.length === 0 && !hasFilter) {
    return (
      <div className="rounded-3xl bg-white p-16 text-center shadow-sm border border-white/60">
        <p className="text-5xl mb-4">📦</p>
        <p className="text-xl font-black text-slate-700 mb-1">Заказов пока нет</p>
        <p className="text-sm text-slate-400 mb-6">Перейдите в каталог и сделайте первый заказ</p>
        <a href="/catalog" className="inline-block rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-8 py-3 text-sm font-bold text-white hover:opacity-90 transition">
          Перейти в каталог
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <OrdersFilterBar
        currentStatus={currentStatus}
        currentDateFrom={currentDateFrom}
        currentDateTo={currentDateTo}
      />

      {orders.length === 0 && hasFilter && (
        <div className="rounded-2xl bg-white border p-10 text-center shadow-sm">
          <p className="text-3xl mb-3">🔍</p>
          <p className="font-bold text-slate-700">Заказов не найдено</p>
          <p className="text-sm text-slate-400 mt-1">Попробуйте изменить фильтры</p>
        </div>
      )}

      {stats.totalOrders > 0 && orders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm border border-white/60" style={{ boxShadow: "0 2px 12px rgba(236,72,153,0.08)" }}>
            <p className="text-xs font-semibold text-slate-400 mb-1">🛒 Заказов</p>
            <p className="text-2xl font-black bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">{stats.totalOrders}</p>
          </div>
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm border border-white/60" style={{ boxShadow: "0 2px 12px rgba(139,92,246,0.08)" }}>
            <p className="text-xs font-semibold text-slate-400 mb-1">💰 Сумма</p>
            <p className="text-xl font-black bg-gradient-to-r from-purple-500 to-blue-600 bg-clip-text text-transparent leading-tight">{formatMoney(stats.totalSum)}</p>
          </div>
          {stats.topProduct && (
            <div className="col-span-2 rounded-2xl bg-white px-5 py-4 shadow-sm border border-white/60 sm:col-span-1" style={{ boxShadow: "0 2px 12px rgba(59,130,246,0.08)" }}>
              <p className="text-xs font-semibold text-slate-400 mb-1">⭐ Топ товар</p>
              <p className="text-sm font-bold text-slate-800 line-clamp-2">{stats.topProduct}</p>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}
