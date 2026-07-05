"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type CheckStatus = "ok" | "out_of_stock" | "expired" | "bad_condition" | "insufficient_qty";

type Photo = { id: number; url: string };

type ItemCheck = {
  status: string;
  availableQty: number | null;
  note: string | null;
  picker: { name: string } | null;
  updatedAt: string;
};

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  total: number;
  check: ItemCheck | null;
  photos: Photo[];
};

type Message = {
  id: number;
  text: string;
  isFromPicker: boolean;
  createdAt: string;
  user: { name: string; role: string } | null;
};

type StatusLog = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
};

type PickerUser = { id: number; name: string };

type Order = {
  id: number;
  status: string;
  total: number;
  comment: string | null;
  customerConfirmed: boolean;
  pickerId: number | null;
  picker: { id: number; name: string } | null;
  customer: {
    companyName: string | null;
    name: string | null;
    phone: string | null;
    city: string | null;
    inn: string | null;
  };
  items: OrderItem[];
  messages: Message[];
  statusLogs: StatusLog[];
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидание",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "Консультация",
  payment: "К оплате",
  exported: "Выгружен",
  cancelled: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  assembly: "bg-blue-100 text-blue-800 border-blue-300",
  consultation: "bg-orange-100 text-orange-800 border-orange-300",
  payment: "bg-green-100 text-green-800 border-green-300",
  exported: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const CHECK_LABELS: Record<string, { label: string; color: string }> = {
  ok: { label: "✓ ОК", color: "bg-green-100 text-green-700" },
  out_of_stock: { label: "✗ Нет в наличии", color: "bg-red-100 text-red-700" },
  expired: { label: "⏰ Просрочен", color: "bg-orange-100 text-orange-700" },
  bad_condition: { label: "👎 Плохой вид", color: "bg-yellow-100 text-yellow-700" },
  insufficient_qty: { label: "⬇ Не хватает", color: "bg-blue-100 text-blue-700" },
};

const PIPELINE = ["pending", "assembly", "consultation", "payment", "exported"];

const TRANSITIONS: Record<string, { label: string; to: string; style: string }[]> = {
  pending: [
    { label: "▶ Передать на сборку", to: "assembly", style: "bg-blue-600 hover:bg-blue-700 text-white" },
    { label: "✕ Отменить заказ", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  approved: [
    { label: "▶ Передать на сборку", to: "assembly", style: "bg-blue-600 hover:bg-blue-700 text-white" },
    { label: "✓ К оплате", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  assembly: [
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  consultation: [
    { label: "↩ Вернуть на сборку", to: "assembly", style: "bg-blue-100 hover:bg-blue-200 text-blue-700" },
    { label: "✓ Подтвердить к оплате", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  payment: [
    { label: "✓ Выгрузить в 1С", to: "exported", style: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
};

function formatDate(str: string) {
  return new Date(str).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// ── Edit items state ──────────────────────────────────────────────────────────
type EditableItem = {
  id: number;          // positive = existing DB id; negative = temp id for new item
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  removed: boolean;
  isNew: boolean;      // true = not yet in DB
};

type ProductSearchResult = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  stock: number | null;
  price: number;
  imagePath: string | null;
};

type CatalogCategory = {
  id: number;
  guid: string;
  name: string;
  parentGuid: string | null;
};

export default function AdminOrderClient({
  order: initialOrder,
  pickers,
}: {
  order: Order;
  pickers: PickerUser[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [messages, setMessages] = useState<Message[]>(initialOrder.messages);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "chat" | "history">("items");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const nextTempId = useRef(-1); // negative = not yet saved

  // Product search / catalog modal
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const paginationRef = useRef({ offset: 0, hasMore: false, loading: false });
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Categories for modal sidebar
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [selectedCategoryGuid, setSelectedCategoryGuid] = useState<string>("");
  const [expandedCategoryGuids, setExpandedCategoryGuids] = useState<Set<string>>(new Set());

  // Assign picker
  const [assigningPicker, setAssigningPicker] = useState(false);

  function enterEditMode() {
    setEditItems(
      order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        barcode: i.barcode,
        quantity: i.quantity,
        price: i.price,
        removed: false,
        isNew: false,
      }))
    );
    setEditMode(true);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditItems([]);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  function closeCatalog() {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedCategoryGuid("");
    setHasMore(false);
    paginationRef.current = { offset: 0, hasMore: false, loading: false };
  }

  function buildSearchUrl(q: string, categoryGuid: string, offset = 0) {
    const params = new URLSearchParams({ limit: "40" });
    if (q.trim().length >= 2) params.set("q", q.trim());
    if (categoryGuid) params.set("categoryGuid", categoryGuid);
    if (offset > 0) params.set("offset", String(offset));
    return `/api/admin/products/search?${params.toString()}`;
  }

  function handleSearchInput(q: string) {
    setSearchQuery(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      fetchProducts(q, selectedCategoryGuid);
    }, 250);
  }

  async function fetchProducts(q: string, categoryGuid: string) {
    setSearchLoading(true);
    setSearchError(null);
    setHasMore(false);
    paginationRef.current = { offset: 0, hasMore: false, loading: false };
    try {
      const res = await fetch(buildSearchUrl(q, categoryGuid, 0));
      if (res.ok) {
        const data = await res.json();
        const products = data.products ?? [];
        setSearchResults(products);
        const more = data.hasMore ?? false;
        setHasMore(more);
        paginationRef.current = { offset: products.length, hasMore: more, loading: false };
      } else {
        const text = await res.text();
        setSearchError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        setSearchResults([]);
      }
    } catch (e) {
      setSearchError(String(e));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadMore(q: string, categoryGuid: string) {
    const p = paginationRef.current;
    if (!p.hasMore || p.loading) return;
    p.loading = true;
    setLoadingMore(true);
    try {
      const res = await fetch(buildSearchUrl(q, categoryGuid, p.offset));
      if (res.ok) {
        const data = await res.json();
        const products = data.products ?? [];
        setSearchResults((prev) => [...prev, ...products]);
        const more = data.hasMore ?? false;
        p.offset += products.length;
        p.hasMore = more;
        setHasMore(more);
      }
    } finally {
      p.loading = false;
      setLoadingMore(false);
    }
  }

  function selectCategory(guid: string) {
    const next = selectedCategoryGuid === guid ? "" : guid;
    setSelectedCategoryGuid(next);
    fetchProducts(searchQuery, next);
  }

  function toggleExpand(guid: string) {
    setExpandedCategoryGuids((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }

  function openCatalog() {
    setShowSearch(true);
    setSearchQuery("");
    setSelectedCategoryGuid("");
    // Load categories + products in parallel
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats: CatalogCategory[] = d.categories ?? [];
        setCategories(cats);
        // Auto-expand all top-level categories
        const topGuids = cats.filter((c) => !c.parentGuid).map((c) => c.guid);
        setExpandedCategoryGuids(new Set(topGuids));
      });
    fetchProducts("", "");
  }

  function addProductToEdit(p: ProductSearchResult) {
    const tempId = nextTempId.current--;
    setEditItems((prev) => [
      ...prev,
      {
        id: tempId,
        productId: p.id,
        productName: p.name,
        barcode: p.barcode,
        quantity: 1,
        price: Math.round(p.price),
        removed: false,
        isNew: true,
      },
    ]);
  }

  function editQty(id: number, qty: number) {
    setEditItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, qty) } : i))
    );
  }

  function editPrice(id: number, price: number) {
    setEditItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, price: Math.max(0, price) } : i))
    );
  }

  function toggleRemove(id: number) {
    setEditItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, removed: !i.removed } : i))
    );
  }

  const editTotal = editItems
    .filter((i) => !i.removed)
    .reduce((s, i) => s + i.quantity * i.price, 0);

  async function saveItems() {
    setSaving(true);
    try {
      const existing = editItems.filter((i) => !i.isNew);
      const newOnes = editItems.filter((i) => i.isNew && !i.removed);
      const res = await fetch(`/api/admin/orders/${order.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: existing.filter((i) => !i.removed).map((i) => ({
            id: i.id,
            quantity: i.quantity,
            price: i.price,
          })),
          removeIds: existing.filter((i) => i.removed).map((i) => i.id),
          newItems: newOnes.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            barcode: i.barcode,
            quantity: i.quantity,
            price: i.price,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update items and total in local state
        setOrder((prev) => ({
          ...prev,
          total: data.order.total,
          items: data.order.items.map((i: any) => ({
            ...i,
            check: i.check
              ? {
                  ...i.check,
                  updatedAt: i.check.checkedAt ?? i.check.updatedAt,
                }
              : null,
          })),
        }));
        setEditMode(false);
      } else {
        const d = await res.json();
        alert(d.error || "Ошибка сохранения");
      }
    } finally {
      setSaving(false);
    }
  }

  // Assign picker
  async function assignPicker(pickerId: number | null) {
    setAssigningPicker(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickerId }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrder((prev) => ({
          ...prev,
          pickerId: data.order.pickerId,
          picker: data.order.picker,
        }));
      }
    } finally {
      setAssigningPicker(false);
    }
  }

  // Poll messages
  useEffect(() => {
    if (activeTab !== "chat") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const fetchMsgs = async () => {
      const res = await fetch(`/api/picker/messages/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    };
    fetchMsgs();
    pollRef.current = setInterval(fetchMsgs, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeTab, order.id]);

  useEffect(() => {
    if (activeTab === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  async function changeStatus(toStatus: string) {
    setChangingStatus(true);
    const res = await fetch(`/api/admin/orders/${order.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toStatus }),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json();
      alert(data.error || "Ошибка смены статуса");
    }
    setChangingStatus(false);
  }

  async function sendMessage() {
    if (!msgText.trim()) return;
    setSendingMsg(true);
    const res = await fetch(`/api/picker/messages/${order.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msgText }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setMsgText("");
    }
    setSendingMsg(false);
  }

  const transitions = TRANSITIONS[order.status] || [];
  const pipelineIndex = PIPELINE.indexOf(order.status);
  const canEdit = ["consultation", "assembly"].includes(order.status);
  const showInvoice = ["payment", "exported"].includes(order.status);

  return (
    <div className="p-4 md:p-6 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 12px; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <a href="/admin/orders" className="no-print flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-slate-50">←</a>
            <h1 className="text-2xl font-black">Заказ №{order.id}</h1>
            <span className={`rounded-full border px-3 py-1 text-sm font-bold ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {order.customerConfirmed && (
              <span className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-sm font-bold text-emerald-700">
                ✓ Покупатель подтвердил
              </span>
            )}
          </div>
          <div className="mt-2 ml-12 text-sm text-slate-500">
            <div>{order.customer.companyName || order.customer.name} · {order.customer.phone}</div>
            {order.customer.city && <div>{order.customer.city}</div>}
            <div className="text-xs">{formatDate(order.createdAt)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 no-print flex-wrap">
          {showInvoice && (
            <a
              href={`/admin/orders/${order.id}/invoice`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              📄 Счёт PDF
            </a>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            🖨️ Печать
          </button>
          <div className="text-right">
            <div className="text-2xl font-black">{order.total.toLocaleString("ru-RU")} ₽</div>
            <div className="text-xs text-slate-400">{order.items.length} позиций</div>
          </div>
        </div>
      </div>

      {/* Status Pipeline */}
      <div className="no-print mb-4 overflow-x-auto rounded-2xl border bg-white p-4">
        <div className="flex min-w-max items-center gap-0">
          {PIPELINE.filter((s) => s !== "cancelled").map((s, idx) => {
            const isDone = pipelineIndex > idx;
            const isCurrent = pipelineIndex === idx;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                  isCurrent ? STATUS_COLORS[s] + " border" :
                  isDone ? "bg-slate-100 text-slate-400" : "text-slate-300"
                }`}>
                  {isDone && <span>✓</span>}
                  {STATUS_LABELS[s]}
                </div>
                {idx < PIPELINE.filter((s) => s !== "cancelled").length - 1 && (
                  <div className={`mx-1 text-lg ${isDone ? "text-slate-400" : "text-slate-200"}`}>›</div>
                )}
              </div>
            );
          })}
          {order.status === "cancelled" && (
            <div className="ml-4 rounded-xl bg-red-100 px-3 py-2 text-sm font-bold text-red-700 border border-red-300">✕ Отменён</div>
          )}
        </div>
      </div>

      {/* Action buttons + Assign Picker */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        {transitions.map((t) => (
          <button
            key={t.to}
            onClick={() => changeStatus(t.to)}
            disabled={changingStatus}
            className={`rounded-xl px-5 py-2.5 font-bold transition-all disabled:opacity-50 ${t.style}`}
          >
            {changingStatus ? "..." : t.label}
          </button>
        ))}

        {/* Assign picker */}
        {["pending", "assembly", "approved"].includes(order.status) && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-500">Сборщик:</span>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={order.pickerId ?? ""}
              disabled={assigningPicker}
              onChange={(e) => assignPicker(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Не назначен —</option>
              {pickers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {assigningPicker && <span className="text-xs text-slate-400">Сохраняю...</span>}
          </div>
        )}
      </div>

      {/* Print header */}
      <div className="print-only mb-4">
        <h2 className="text-xl font-bold">Лист сборки — Заказ №{order.id}</h2>
        <p>{order.customer.companyName || order.customer.name} · {order.customer.phone}</p>
        <p>Дата: {formatDate(order.createdAt)}</p>
      </div>

      {/* Tabs */}
      <div className="no-print mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {(["items", "chat", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
              activeTab === tab ? "bg-white shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "items" ? `📦 Позиции (${order.items.length})` :
             tab === "chat" ? `💬 Чат (${messages.length})` :
             `📋 История (${order.statusLogs.length})`}
          </button>
        ))}
      </div>

      {/* ── Items tab ── */}
      {(activeTab === "items" || true) && (
        <div className={activeTab === "items" ? "" : "hidden print:block"}>
          {/* Edit mode toggle */}
          {canEdit && !editMode && (
            <div className="no-print mb-3 flex items-center gap-3">
              <button
                onClick={enterEditMode}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                ✏️ Редактировать позиции
              </button>
              {order.status === "consultation" && !order.customerConfirmed && (
                <span className="text-sm text-orange-600">
                  ⏳ Ожидаем подтверждения от покупателя
                </span>
              )}
            </div>
          )}

          {/* Edit mode toolbar */}
          {editMode && (
            <div className="no-print mb-3 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <span className="text-sm font-semibold text-amber-800">Режим редактирования</span>
              <span className="text-sm text-amber-700">
                Итого: <strong>{editTotal.toLocaleString("ru-RU")} ₽</strong>
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={cancelEdit}
                  className="rounded-xl border px-4 py-1.5 text-sm font-semibold hover:bg-white"
                >
                  Отмена
                </button>
                <button
                  onClick={saveItems}
                  disabled={saving || editItems.filter((i) => !i.removed).length === 0}
                  className="rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Сохраняю..." : "💾 Сохранить"}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Товар</th>
                  <th className="p-3 text-left">Штрихкод</th>
                  <th className="p-3 text-center">Кол-во</th>
                  <th className="p-3 text-right">Цена</th>
                  <th className="p-3 text-right">Сумма</th>
                  {!editMode && <th className="p-3 text-center no-print">Проверка</th>}
                  {editMode && <th className="p-3 text-center no-print">Удалить</th>}
                  <th className="p-3 text-center print-only">✓</th>
                </tr>
              </thead>
              <tbody>
                {editMode
                  ? editItems.map((item) => (
                      <tr key={item.id} className={`border-t ${item.removed ? "opacity-40 line-through bg-red-50" : ""}`}>
                        <td className="p-3">
                          <div className="font-medium">{item.productName}</div>
                        </td>
                        <td className="p-3 text-slate-400">{item.barcode || "—"}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            disabled={item.removed}
                            onChange={(e) => editQty(item.id, Number(e.target.value))}
                            className="w-16 rounded-lg border px-2 py-1 text-center text-sm"
                          />
                        </td>
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min={0}
                            value={item.price}
                            disabled={item.removed}
                            onChange={(e) => editPrice(item.id, Number(e.target.value))}
                            className="w-24 rounded-lg border px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="p-3 text-right font-bold">
                          {(item.quantity * item.price).toLocaleString("ru-RU")} ₽
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleRemove(item.id)}
                            className={`rounded-lg px-2 py-1 text-xs font-bold ${
                              item.removed
                                ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                : "bg-red-100 text-red-600 hover:bg-red-200"
                            }`}
                          >
                            {item.removed ? "↩ Вернуть" : "✕ Удалить"}
                          </button>
                        </td>
                      </tr>
                    ))
                  : order.items.map((item) => {
                      const check = item.check;
                      const checkInfo = check ? CHECK_LABELS[check.status] : null;
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{item.productName}</div>
                            {check?.note && (
                              <div className="mt-0.5 text-xs text-slate-400 no-print">{check.note}</div>
                            )}
                            {item.photos.length > 0 && (
                              <div className="mt-1 flex gap-1 no-print">
                                {item.photos.map((p) => (
                                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                                    <img src={p.url} alt="" className="h-10 w-10 rounded-lg object-cover border" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-400">{item.barcode || "—"}</td>
                          <td className="p-3 text-center font-bold">{item.quantity}</td>
                          <td className="p-3 text-right">{item.price} ₽</td>
                          <td className="p-3 text-right font-bold">{item.total} ₽</td>
                          <td className="p-3 text-center no-print">
                            {checkInfo ? (
                              <div>
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${checkInfo.color}`}>
                                  {checkInfo.label}
                                </span>
                                {check?.availableQty != null && (
                                  <div className="mt-0.5 text-xs text-slate-500">Есть: {check.availableQty} шт.</div>
                                )}
                                {check?.picker && (
                                  <div className="mt-0.5 text-xs text-slate-400">{check.picker.name}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center print-only">
                            <div className="inline-block h-5 w-5 rounded border border-slate-300"></div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td colSpan={editMode ? 4 : 4} className="p-3 text-right font-semibold">Итого:</td>
                  <td className="p-3 text-right text-lg font-black">
                    {editMode
                      ? `${editTotal.toLocaleString("ru-RU")} ₽`
                      : `${order.total.toLocaleString("ru-RU")} ₽`}
                  </td>
                  <td colSpan={1} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Add product button (edit mode only) */}
          {editMode && (
            <div className="no-print mt-3">
              <button
                onClick={openCatalog}
                className="flex items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-100 w-full justify-center"
              >
                + Добавить товар из каталога
              </button>
            </div>
          )}

          {order.comment && (
            <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-slate-600">
              <span className="font-semibold">Комментарий:</span> {order.comment}
            </div>
          )}
        </div>
      )}

      {/* ── Chat tab ── */}
      {activeTab === "chat" && (
        <div className="no-print flex flex-col rounded-2xl border bg-white overflow-hidden" style={{ height: 480 }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-sm mt-8">
                Чат пустой. Напишите первое сообщение сборщику.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isFromPicker ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                  msg.isFromPicker
                    ? "bg-slate-100 text-slate-800 rounded-tl-sm"
                    : "bg-blue-600 text-white rounded-tr-sm"
                }`}>
                  <div className="font-bold text-xs mb-0.5 opacity-70">
                    {msg.user?.name || (msg.isFromPicker ? "Сборщик" : "Менеджер")}
                  </div>
                  <div>{msg.text}</div>
                  <div className="text-xs mt-0.5 opacity-60">{formatDate(msg.createdAt)}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t p-3 flex gap-2">
            <input
              type="text"
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Сообщение сборщику..."
              className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={sendingMsg || !msgText.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sendingMsg ? "..." : "→"}
            </button>
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "history" && (
        <div className="no-print rounded-2xl border bg-white overflow-hidden">
          {order.statusLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">История пустая</div>
          ) : (
            <div className="divide-y">
              {order.statusLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-4">
                  <div className="text-2xl">
                    {log.toStatus === "assembly" ? "📦" :
                     log.toStatus === "consultation" ? "💬" :
                     log.toStatus === "payment" ? "💳" :
                     log.toStatus === "exported" ? "✅" :
                     log.toStatus === "cancelled" ? "❌" : "📋"}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      {log.fromStatus ? (
                        <>
                          <span className="text-slate-400">{STATUS_LABELS[log.fromStatus] || log.fromStatus}</span>
                          <span className="mx-1 text-slate-300">→</span>
                        </>
                      ) : null}
                      <span>{STATUS_LABELS[log.toStatus] || log.toStatus}</span>
                    </div>
                    <div className="text-xs text-slate-400">{formatDate(log.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mini Catalog Modal ── */}
      {showSearch && (
        <div className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="flex flex-col bg-white w-full sm:max-w-5xl rounded-t-3xl sm:rounded-2xl shadow-2xl" style={{ maxHeight: "92vh" }}>

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0">
              <h2 className="text-lg font-black flex-1">Добавить товар</h2>
              {/* Added badge */}
              {editItems.filter((i) => i.isNew && !i.removed).length > 0 && (
                <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  +{editItems.filter((i) => i.isNew && !i.removed).length} добавлено
                </span>
              )}
              <button
                onClick={closeCatalog}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 text-lg shrink-0"
              >
                ✕
              </button>
            </div>

            {/* ── Search ── */}
            <div className="px-5 py-3 border-b shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="🔍 Поиск по названию, штрихкоду или артикулу..."
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* ── Added strip ── */}
            {editItems.filter((i) => i.isNew && !i.removed).length > 0 && (
              <div className="px-5 py-2 bg-blue-50 border-b shrink-0 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-blue-700 shrink-0">Добавлено:</span>
                {editItems.filter((i) => i.isNew && !i.removed).map((i) => (
                  <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                    {i.productName.length > 28 ? i.productName.slice(0, 28) + "…" : i.productName}
                    <button
                      onClick={() => setEditItems((prev) => prev.map((x) => x.id === i.id ? { ...x, removed: true } : x))}
                      className="text-blue-400 hover:text-blue-700 ml-0.5"
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            {/* ── Body: sidebar + grid ── */}
            <div className="flex flex-1 overflow-hidden">

              {/* Categories sidebar */}
              {categories.length > 0 && (
                <div className="hidden sm:flex flex-col w-52 border-r shrink-0 overflow-y-auto bg-slate-50">
                  <button
                    onClick={() => selectCategory("")}
                    className={`px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                      selectedCategoryGuid === ""
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Все товары
                  </button>
                  {/* Top-level categories */}
                  {categories.filter((c) => !c.parentGuid).map((cat) => {
                    const children = categories.filter((c) => c.parentGuid === cat.guid);
                    const isExpanded = expandedCategoryGuids.has(cat.guid);
                    const isSelected = selectedCategoryGuid === cat.guid;
                    const allDescendants = categories.filter((c) => {
                      const parent = categories.find((p) => p.guid === c.parentGuid);
                      return c.parentGuid === cat.guid || parent?.parentGuid === cat.guid;
                    });
                    const childSelected = allDescendants.some((c) => c.guid === selectedCategoryGuid);
                    return (
                      <div key={cat.guid}>
                        <div className={`flex items-center border-t border-slate-200 ${
                          isSelected || childSelected ? "bg-blue-50" : ""
                        }`}>
                          <button
                            onClick={() => selectCategory(cat.guid)}
                            className={`flex-1 px-4 py-2 text-left text-sm transition-colors truncate ${
                              isSelected
                                ? "font-bold text-blue-700"
                                : "text-slate-700 hover:text-blue-600"
                            }`}
                          >
                            {cat.name}
                          </button>
                          {children.length > 0 && (
                            <button
                              onClick={() => toggleExpand(cat.guid)}
                              className="px-2 py-2 text-slate-400 hover:text-slate-600 text-xs shrink-0"
                            >
                              {isExpanded ? "▲" : "▼"}
                            </button>
                          )}
                        </div>
                        {/* Level 2 children */}
                        {isExpanded && children.map((child) => {
                          const grandchildren = categories.filter((c) => c.parentGuid === child.guid);
                          const childExpanded = expandedCategoryGuids.has(child.guid);
                          const childIsSelected = selectedCategoryGuid === child.guid;
                          const grandchildSelected = grandchildren.some((c) => c.guid === selectedCategoryGuid);
                          return (
                            <div key={child.guid}>
                              <div className={`flex items-center ${
                                childIsSelected || grandchildSelected ? "bg-blue-50" : ""
                              }`}>
                                <button
                                  onClick={() => selectCategory(child.guid)}
                                  className={`flex-1 pl-6 pr-2 py-1.5 text-left text-xs transition-colors truncate ${
                                    childIsSelected
                                      ? "font-bold text-blue-700"
                                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                                  }`}
                                >
                                  {child.name}
                                </button>
                                {grandchildren.length > 0 && (
                                  <button
                                    onClick={() => toggleExpand(child.guid)}
                                    className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs shrink-0"
                                  >
                                    {childExpanded ? "▲" : "▼"}
                                  </button>
                                )}
                              </div>
                              {/* Level 3 grandchildren */}
                              {childExpanded && grandchildren.map((grand) => (
                                <button
                                  key={grand.guid}
                                  onClick={() => selectCategory(grand.guid)}
                                  className={`block w-full pl-10 pr-4 py-1 text-left text-xs transition-colors truncate ${
                                    selectedCategoryGuid === grand.guid
                                      ? "bg-blue-100 font-bold text-blue-700"
                                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  }`}
                                >
                                  {grand.name}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Product grid */}
              <div
                className="flex-1 overflow-y-auto p-4"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
                    loadMore(searchQuery, selectedCategoryGuid);
                  }
                }}
              >
                {searchLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                    <p className="text-sm">Загружаю товары...</p>
                  </div>
                ) : searchError ? (
                  <div className="flex flex-col items-center justify-center py-20 text-red-400">
                    <div className="mb-3 text-4xl">⚠️</div>
                    <p className="text-sm font-semibold mb-1">Ошибка загрузки товаров</p>
                    <p className="text-xs text-center max-w-xs break-all">{searchError}</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <div className="mb-3 text-4xl">🔍</div>
                    <p className="text-sm">Ничего не найдено</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {searchResults.map((p) => {
                      const alreadyAdded = editItems.some((i) => i.productId === p.id && !i.removed);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (alreadyAdded) {
                              setEditItems((prev) =>
                                prev.map((i) =>
                                  i.productId === p.id && !i.removed ? { ...i, removed: true } : i
                                )
                              );
                            } else {
                              addProductToEdit(p);
                            }
                          }}
                          className={`flex flex-col rounded-2xl border text-left transition-all ${
                            alreadyAdded
                              ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200 hover:border-red-300 hover:bg-red-50"
                              : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md active:scale-95"
                          }`}
                        >
                          {/* Image */}
                          <div className="relative w-full aspect-square rounded-t-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
                            {p.imagePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imagePath.startsWith("http") ? p.imagePath : `https://kosmetichka-opt.ru/api/1c/${p.imagePath}`}
                                alt={p.name}
                                className="h-full w-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <span className="text-4xl">🧴</span>
                            )}
                            {alreadyAdded && (
                              <div className="group/card absolute inset-0 flex items-center justify-center bg-blue-600/20 hover:bg-red-500/30">
                                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white shadow group-hover/card:hidden">✓ Добавлен</span>
                                <span className="hidden rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white shadow group-hover/card:inline">✕ Убрать</span>
                              </div>
                            )}
                            {p.stock !== null && (
                              <div className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-xs font-bold text-white shadow ${
                                p.stock <= 0 ? "bg-red-500" : "bg-green-500"
                              }`}>
                                {p.stock <= 0 ? "Нет" : `${p.stock} шт`}
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex flex-col flex-1 p-2.5 gap-1">
                            <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight min-h-[2.5rem]">
                              {p.name}
                            </p>
                            {p.barcode && (
                              <p className="text-xs text-slate-400 truncate">{p.barcode}</p>
                            )}
                            <div className="mt-auto pt-1 flex items-center justify-between gap-1">
                              <span className="text-sm font-black text-slate-800">
                                {Math.round(p.price).toLocaleString("ru-RU")} ₽
                              </span>
                              {!alreadyAdded ? (
                                <span className="shrink-0 rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                                  + Добавить
                                </span>
                              ) : (
                                <span className="shrink-0 text-xs text-blue-600">✓</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Load more indicator */}
                {loadingMore && (
                  <div className="flex justify-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                  </div>
                )}
                {!hasMore && searchResults.length > 0 && !searchLoading && (
                  <p className="py-4 text-center text-xs text-slate-300">Все товары загружены</p>
                )}
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between border-t px-5 py-3 shrink-0 bg-white">
              <span className="text-sm text-slate-500">
                {editItems.filter((i) => i.isNew && !i.removed).length > 0
                  ? `${editItems.filter((i) => i.isNew && !i.removed).length} товаров добавлено в заказ`
                  : "Нажмите на карточку, чтобы добавить"}
              </span>
              <button
                onClick={closeCatalog}
                className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
