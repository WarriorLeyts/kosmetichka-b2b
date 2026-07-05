"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

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

type CustomerMessage = {
  id: number;
  text: string;
  isFromPicker: boolean; // true = admin sent, false = customer sent
  createdAt: string;
};

type StatusLog = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
};

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

type PickerUser = { id: number; name: string };

type EditItem = {
  id: number | null; // null = new
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  removed?: boolean;
  isNew?: boolean;
};

type CatalogProduct = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  stock: number | null;
  price: number;
  prices: { priceType: string; price: number }[];
  imagePath: string | null;
};

type CatalogCategory = {
  id: number;
  guid: string;
  name: string;
  parentGuid: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(str: string) {
  return new Date(str).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProductImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `https://kosmetichka-opt.ru/api/1c/${imagePath}`;
}

function renderMsgContent(text: string) {
  try {
    const obj = JSON.parse(text);
    if (obj?._t === "img" && obj.url) {
      return (
        <a href={obj.url} target="_blank" rel="noreferrer">
          <img
            src={obj.url}
            alt="фото"
            className="max-w-[200px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90"
          />
        </a>
      );
    }
    if (obj?._t === "product") {
      const imgUrl = getProductImageUrl(obj.imagePath ?? null);
      return (
        <div className="rounded-xl border bg-white text-slate-800 overflow-hidden w-52 shadow-sm">
          {imgUrl && (
            <img
              src={imgUrl}
              alt={obj.name}
              className="w-full h-24 object-contain bg-slate-50 p-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="p-2">
            <p className="font-semibold text-sm leading-snug">{obj.name}</p>
            {obj.price > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {Number(obj.price).toLocaleString("ru-RU")} ₽
              </p>
            )}
          </div>
        </div>
      );
    }
  } catch {}
  return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminOrderClient({
  order: initialOrder,
  pickers,
  customerMessages: initialCustomerMessages,
}: {
  order: Order;
  pickers: PickerUser[];
  customerMessages: CustomerMessage[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);

  // ── Picker chat ──
  const [messages, setMessages] = useState<Message[]>(initialOrder.messages);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // ── Customer chat ──
  const [customerMessages, setCustomerMessages] = useState<CustomerMessage[]>(initialCustomerMessages);
  const [customerMsgText, setCustomerMsgText] = useState("");
  const [sendingCustomerMsg, setSendingCustomerMsg] = useState(false);

  // ── UI state ──
  const [changingStatus, setChangingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "chat" | "history">("items");
  const [chatSubTab, setChatSubTab] = useState<"customer" | "picker">("customer");
  const pickerChatEndRef = useRef<HTMLDivElement>(null);
  const customerChatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Order edit ──
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Catalog modal ──
  // mode: "order" = add to order, "chat-picker" | "chat-customer" = send product card in chat
  const [catalogMode, setCatalogMode] = useState<"order" | "chat-picker" | "chat-customer">("order");
  const [showCatalog, setShowCatalog] = useState(false);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedCatGuid, setSelectedCatGuid] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const paginationRef = useRef({ offset: 0, hasMore: false, loading: false });

  // ── Image upload ──
  const [uploadingImg, setUploadingImg] = useState<"picker" | "customer" | null>(null);

  // ── Picker chat: assign picker dropdown ──
  const [assigningPicker, setAssigningPicker] = useState(false);
  const [selectedPickerId, setSelectedPickerId] = useState<number | "">(order.pickerId ?? "");

  // ── Effects ──

  useEffect(() => {
    if (activeTab !== "chat") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const fetchPicker = async () => {
      const res = await fetch(`/api/picker/messages/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    };
    const fetchCustomer = async () => {
      const res = await fetch(`/api/admin/orders/${order.id}/customer-messages`);
      if (res.ok) {
        const data = await res.json();
        setCustomerMessages(data.messages ?? []);
      }
    };

    const poll = async () => {
      await Promise.all([fetchPicker(), fetchCustomer()]);
    };
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTab, order.id]);

  useEffect(() => {
    if (activeTab === "chat") {
      if (chatSubTab === "picker") pickerChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      if (chatSubTab === "customer") customerChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, customerMessages, activeTab, chatSubTab]);

  // ── Status change ──
  async function changeStatus(toStatus: string) {
    setChangingStatus(true);
    const res = await fetch(`/api/admin/orders/${order.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toStatus }),
    });
    if (res.ok) {
      router.refresh();
      window.location.reload();
    } else {
      const data = await res.json();
      alert(data.error || "Ошибка смены статуса");
    }
    setChangingStatus(false);
  }

  // ── Picker chat ──
  async function sendPickerMessage(text?: string) {
    const t = (text ?? msgText).trim();
    if (!t) return;
    setSendingMsg(true);
    const res = await fetch(`/api/picker/messages/${order.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      if (!text) setMsgText("");
    }
    setSendingMsg(false);
  }

  // ── Customer chat ──
  async function sendCustomerMessage(text?: string) {
    const t = (text ?? customerMsgText).trim();
    if (!t) return;
    setSendingCustomerMsg(true);
    const res = await fetch(`/api/admin/orders/${order.id}/customer-messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t }),
    });
    if (res.ok) {
      const data = await res.json();
      setCustomerMessages((prev) => [...prev, data.message]);
      if (!text) setCustomerMsgText("");
    }
    setSendingCustomerMsg(false);
  }

  // ── Image upload for chat ──
  async function uploadChatImage(file: File, target: "picker" | "customer") {
    setUploadingImg(target);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/chat", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const msgJson = JSON.stringify({ _t: "img", url: data.url });
        if (target === "picker") await sendPickerMessage(msgJson);
        else await sendCustomerMessage(msgJson);
      }
    } finally {
      setUploadingImg(null);
    }
  }

  // ── Catalog ──
  function buildSearchUrl(q: string, catGuid: string, offset: number) {
    const params = new URLSearchParams({ limit: "40", offset: String(offset) });
    if (q.length >= 2) params.set("q", q);
    if (catGuid) params.set("categoryGuid", catGuid);
    return `/api/admin/products/search?${params}`;
  }

  async function fetchProducts(q: string, catGuid: string) {
    paginationRef.current = { offset: 0, hasMore: false, loading: false };
    setSearchResults([]);
    setHasMore(false);
    const res = await fetch(buildSearchUrl(q, catGuid, 0));
    if (res.ok) {
      const data = await res.json();
      const products = data.products ?? [];
      const more = data.hasMore ?? false;
      setSearchResults(products);
      paginationRef.current = { offset: products.length, hasMore: more, loading: false };
      setHasMore(more);
    }
  }

  async function loadMore(q: string, catGuid: string) {
    const p = paginationRef.current;
    if (!p.hasMore || p.loading) return;
    p.loading = true;
    setLoadingMore(true);
    try {
      const res = await fetch(buildSearchUrl(q, catGuid, p.offset));
      if (res.ok) {
        const data = await res.json();
        const products = data.products ?? [];
        const more = data.hasMore ?? false;
        setSearchResults((prev) => [...prev, ...products]);
        p.offset += products.length;
        p.hasMore = more;
        setHasMore(more);
      }
    } finally {
      p.loading = false;
      setLoadingMore(false);
    }
  }

  function openCatalog(mode: "order" | "chat-picker" | "chat-customer") {
    setCatalogMode(mode);
    setSearchQuery("");
    setSelectedCatGuid("");
    setShowCatalog(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats: CatalogCategory[] = d.categories ?? [];
        setCategories(cats);
        const topGuids = cats.filter((c) => !c.parentGuid).map((c) => c.guid);
        setExpandedCats(new Set(topGuids));
      });
    fetchProducts("", "");
  }

  function toggleCat(guid: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }

  function selectCat(guid: string) {
    const newGuid = guid === selectedCatGuid ? "" : guid;
    setSelectedCatGuid(newGuid);
    fetchProducts(searchQuery, newGuid);
  }

  function handleCatalogSearch(q: string) {
    setSearchQuery(q);
    fetchProducts(q, selectedCatGuid);
  }

  function handleProductSelect(p: CatalogProduct) {
    if (catalogMode === "order") {
      // Add/remove from order edit
      setEditItems((prev) => {
        const idx = prev.findIndex((i) => i.productId === p.id && !i.isNew);
        if (idx >= 0) {
          // Toggle removed
          return prev.map((i, n) =>
            n === idx ? { ...i, removed: !i.removed } : i
          );
        }
        // Check if new item already added
        const existingNew = prev.find((i) => i.productId === p.id && i.isNew && !i.removed);
        if (existingNew) {
          return prev.map((i) =>
            i.productId === p.id && i.isNew ? { ...i, removed: !i.removed } : i
          );
        }
        return [
          ...prev,
          {
            id: null,
            productId: p.id,
            productName: p.name,
            barcode: p.barcode,
            quantity: 1,
            price: p.price,
            isNew: true,
            removed: false,
          },
        ];
      });
    } else {
      // Send product card in chat
      const msgJson = JSON.stringify({
        _t: "product",
        id: p.id,
        name: p.name,
        price: p.price,
        imagePath: p.imagePath,
      });
      if (catalogMode === "chat-picker") sendPickerMessage(msgJson);
      else sendCustomerMessage(msgJson);
      setShowCatalog(false);
    }
  }

  // ── Order edit ──
  function startEdit() {
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
    setEditError("");
  }

  function cancelEdit() {
    setEditMode(false);
    setEditItems([]);
    setEditError("");
  }

  async function saveEdit() {
    setSaving(true);
    setEditError("");
    const existing = editItems.filter((i) => i.id !== null && !i.isNew);
    const newItems = editItems.filter((i) => i.isNew && !i.removed);
    const removeIds = editItems.filter((i) => i.id !== null && !i.isNew && i.removed).map((i) => i.id as number);
    const updates = existing.filter((i) => !i.removed).map((i) => ({
      id: i.id as number,
      quantity: i.quantity,
      price: i.price,
    }));

    const res = await fetch(`/api/admin/orders/${order.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: updates,
        removeIds,
        newItems: newItems.map((i) => ({
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
      setOrder(data.order);
      setEditMode(false);
      setEditItems([]);
    } else {
      const data = await res.json();
      setEditError(data.error || "Ошибка сохранения");
    }
    setSaving(false);
  }

  // ── Assign picker ──
  async function assignPicker() {
    if (!selectedPickerId) return;
    setAssigningPicker(true);
    const res = await fetch(`/api/admin/orders/${order.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickerId: selectedPickerId }),
    });
    if (res.ok) {
      router.refresh();
      window.location.reload();
    } else {
      const data = await res.json();
      alert(data.error || "Ошибка назначения");
    }
    setAssigningPicker(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const transitions = TRANSITIONS[order.status] || [];
  const pipelineIndex = PIPELINE.indexOf(order.status);

  // Category tree rendering
  const topCats = categories.filter((c) => !c.parentGuid);
  function renderCatTree() {
    return topCats.map((top) => {
      const children = categories.filter((c) => c.parentGuid === top.guid);
      const isTopExpanded = expandedCats.has(top.guid);
      const isTopSelected = selectedCatGuid === top.guid;
      return (
        <div key={top.guid}>
          <div className="flex items-center gap-1">
            {children.length > 0 ? (
              <button
                onClick={() => toggleCat(top.guid)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs"
              >
                {isTopExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <button
              onClick={() => selectCat(top.guid)}
              className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                isTopSelected
                  ? "bg-blue-100 text-blue-700 font-semibold"
                  : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {top.name}
            </button>
          </div>
          {isTopExpanded && children.map((child) => {
            const grandchildren = categories.filter((c) => c.parentGuid === child.guid);
            const isChildExpanded = expandedCats.has(child.guid);
            const isChildSelected = selectedCatGuid === child.guid;
            return (
              <div key={child.guid} className="ml-5">
                <div className="flex items-center gap-1">
                  {grandchildren.length > 0 ? (
                    <button
                      onClick={() => toggleCat(child.guid)}
                      className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs"
                    >
                      {isChildExpanded ? "▼" : "▶"}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <button
                    onClick={() => selectCat(child.guid)}
                    className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                      isChildSelected
                        ? "bg-blue-100 text-blue-700 font-semibold"
                        : "hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    {child.name}
                  </button>
                </div>
                {isChildExpanded && grandchildren.map((grand) => {
                  const isGrandSelected = selectedCatGuid === grand.guid;
                  return (
                    <div key={grand.guid} className="ml-4">
                      <button
                        onClick={() => selectCat(grand.guid)}
                        className={`w-full text-left px-2 py-1 rounded text-sm ${
                          isGrandSelected
                            ? "bg-blue-100 text-blue-700 font-semibold"
                            : "hover:bg-slate-100 text-slate-500"
                        }`}
                      >
                        {grand.name}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    });
  }

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
            <a
              href="/admin/orders"
              className="no-print flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-slate-50"
            >
              ←
            </a>
            <h1 className="text-2xl font-black">Заказ №{order.id}</h1>
            <span className={`rounded-full border px-3 py-1 text-sm font-bold ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <div className="mt-2 ml-12 text-sm text-slate-500">
            <div>{order.customer.companyName || order.customer.name} · {order.customer.phone}</div>
            {order.customer.city && <div>{order.customer.city}</div>}
            <div className="text-xs">{formatDate(order.createdAt)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            🖨️ Печать
          </button>
          <a
            href={`/admin/orders/${order.id}/invoice`}
            className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            📄 Счёт
          </a>
          <div className="text-right">
            <div className="text-2xl font-black">{order.total.toLocaleString("ru-RU")} ₽</div>
            <div className="text-xs text-slate-400">{order.items.length} позиций</div>
          </div>
        </div>
      </div>

      {/* Customer confirmed badge */}
      {order.customerConfirmed && (
        <div className="no-print mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2">
          ✅ Клиент подтвердил замены
        </div>
      )}
      {!order.customerConfirmed && order.status === "consultation" && (
        <div className="no-print mb-4 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700 flex items-center gap-2">
          ⏳ Ожидание подтверждения клиента
        </div>
      )}

      {/* Status Pipeline */}
      {order.status !== "cancelled" && (
        <div className="no-print mb-6 overflow-x-auto">
          <div className="flex min-w-max items-center gap-0">
            {PIPELINE.map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`flex flex-col items-center px-3 py-2 rounded-xl transition-all ${
                  i < pipelineIndex
                    ? "text-green-600"
                    : i === pipelineIndex
                    ? "bg-blue-50 text-blue-700 font-bold"
                    : "text-slate-300"
                }`}>
                  <div className={`h-3 w-3 rounded-full mb-1 ${
                    i < pipelineIndex ? "bg-green-500" : i === pipelineIndex ? "bg-blue-500" : "bg-slate-200"
                  }`} />
                  <span className="text-xs whitespace-nowrap">{STATUS_LABELS[s]}</span>
                </div>
                {i < PIPELINE.length - 1 && (
                  <div className={`h-0.5 w-8 ${i < pipelineIndex ? "bg-green-300" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Picker assignment */}
      {(order.status === "assembly" || order.status === "consultation") && pickers.length > 0 && (
        <div className="no-print mb-4 flex items-center gap-3">
          <span className="text-sm text-slate-500">Сборщик:</span>
          <select
            value={selectedPickerId}
            onChange={(e) => setSelectedPickerId(Number(e.target.value) || "")}
            className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">— не назначен —</option>
            {pickers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={assignPicker}
            disabled={assigningPicker || !selectedPickerId}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {assigningPicker ? "..." : "Назначить"}
          </button>
          {order.picker && (
            <span className="text-sm text-slate-500">Текущий: {order.picker.name}</span>
          )}
        </div>
      )}

      {/* Status action buttons */}
      {transitions.length > 0 && (
        <div className="no-print mb-6 flex flex-wrap gap-3">
          {transitions.map((t) => (
            <button
              key={t.to}
              onClick={() => changeStatus(t.to)}
              disabled={changingStatus}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${t.style}`}
            >
              {changingStatus ? "..." : t.label}
            </button>
          ))}
        </div>
      )}

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
            {tab === "items"
              ? `📦 Позиции (${order.items.length})`
              : tab === "chat"
              ? `💬 Чат (${messages.length + customerMessages.length})`
              : `📋 История (${order.statusLogs.length})`}
          </button>
        ))}
      </div>

      {/* ── ITEMS TAB ── */}
      {activeTab === "items" && (
        <div>
          {/* Edit mode bar */}
          {!editMode ? (
            <div className="no-print mb-4 flex gap-2">
              {["consultation", "assembly"].includes(order.status) && (
                <button
                  onClick={startEdit}
                  className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50"
                >
                  ✏️ Редактировать позиции
                </button>
              )}
            </div>
          ) : (
            <div className="no-print mb-4 rounded-xl border bg-amber-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-bold text-amber-800">Режим редактирования</span>
                <div className="flex gap-2">
                  <button
                    onClick={cancelEdit}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-amber-100"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => openCatalog("order")}
                    className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                  >
                    + Добавить из каталога
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Сохранение..." : "✓ Сохранить"}
                  </button>
                </div>
              </div>
              {editError && (
                <div className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{editError}</div>
              )}
              <div className="space-y-2">
                {editItems.map((item, idx) => {
                  if (item.removed) {
                    return (
                      <div key={idx} className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 opacity-60">
                        <span className="flex-1 text-sm line-through text-red-600">{item.productName}</span>
                        <button
                          onClick={() => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, removed: false } : i))}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Восстановить
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded-xl border bg-white p-2">
                      <span className="flex-1 text-sm font-medium">{item.productName}</span>
                      {item.isNew && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Новый</span>}
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, quantity: Math.max(1, Number(e.target.value)) } : i))}
                        className="w-16 rounded-lg border px-2 py-1 text-center text-sm"
                      />
                      <span className="text-xs text-slate-400">шт.</span>
                      <input
                        type="number"
                        min="0"
                        value={item.price}
                        onChange={(e) => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, price: Math.max(0, Number(e.target.value)) } : i))}
                        className="w-24 rounded-lg border px-2 py-1 text-center text-sm"
                      />
                      <span className="text-xs text-slate-400">₽</span>
                      <button
                        onClick={() => setEditItems((prev) => prev.map((i, n) => n === idx ? { ...i, removed: true } : i))}
                        className="rounded-lg border px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Items list */}
          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left font-semibold text-slate-600">Товар</th>
                  <th className="p-3 text-center font-semibold text-slate-600">Кол-во</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Цена</th>
                  <th className="p-3 text-right font-semibold text-slate-600">Сумма</th>
                  <th className="p-3 text-center font-semibold text-slate-600">Статус</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-medium">{item.productName}</div>
                      {item.barcode && <div className="text-xs text-slate-400">{item.barcode}</div>}
                      {item.photos.length > 0 && (
                        <div className="mt-1 flex gap-1">
                          {item.photos.map((ph) => (
                            <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer">
                              <img src={ph.url} alt="" className="h-8 w-8 rounded object-cover border" />
                            </a>
                          ))}
                        </div>
                      )}
                      {item.check?.note && (
                        <div className="mt-1 text-xs text-slate-500 italic">{item.check.note}</div>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold">{item.quantity}</td>
                    <td className="p-3 text-right">{item.price.toLocaleString("ru-RU")} ₽</td>
                    <td className="p-3 text-right font-bold">{item.total.toLocaleString("ru-RU")} ₽</td>
                    <td className="p-3 text-center">
                      {item.check ? (
                        <div>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${CHECK_LABELS[item.check.status]?.color || "bg-slate-100"}`}>
                            {CHECK_LABELS[item.check.status]?.label || item.check.status}
                          </span>
                          {item.check.availableQty !== null && (
                            <div className="text-xs text-slate-400 mt-0.5">есть {item.check.availableQty}</div>
                          )}
                          {item.check.picker && (
                            <div className="text-xs text-slate-400">{item.check.picker.name}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-slate-50">
                <tr>
                  <td colSpan={3} className="p-3 font-bold text-right text-slate-600">Итого:</td>
                  <td className="p-3 text-right font-black text-lg">{order.total.toLocaleString("ru-RU")} ₽</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {order.comment && (
            <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-slate-600">
              <span className="font-semibold">Комментарий:</span> {order.comment}
            </div>
          )}
        </div>
      )}

      {/* ── CHAT TAB ── */}
      {activeTab === "chat" && (
        <div className="no-print flex flex-col rounded-2xl border bg-white overflow-hidden" style={{ height: "560px" }}>
          {/* Sub-tabs */}
          <div className="flex border-b bg-slate-50">
            <button
              onClick={() => setChatSubTab("customer")}
              className={`flex-1 py-3 text-sm font-bold transition-all ${
                chatSubTab === "customer" ? "border-b-2 border-blue-500 text-blue-600 bg-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              💬 Клиент ({customerMessages.length})
            </button>
            <button
              onClick={() => setChatSubTab("picker")}
              className={`flex-1 py-3 text-sm font-bold transition-all ${
                chatSubTab === "picker" ? "border-b-2 border-blue-500 text-blue-600 bg-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              🔧 Сборщик ({messages.length})
            </button>
          </div>

          {/* ── Customer sub-tab ── */}
          {chatSubTab === "customer" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {customerMessages.length === 0 && (
                  <div className="text-center text-slate-400 text-sm mt-8">
                    Нет сообщений с клиентом.
                  </div>
                )}
                {customerMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isFromPicker ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                      msg.isFromPicker
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-slate-100 text-slate-800 rounded-tl-sm"
                    }`}>
                      <div className="font-bold text-xs mb-0.5 opacity-70">
                        {msg.isFromPicker ? "Менеджер" : "Клиент"}
                      </div>
                      <div>{renderMsgContent(msg.text)}</div>
                      <div className="text-xs mt-0.5 opacity-60">{formatDate(msg.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={customerChatEndRef} />
              </div>
              <div className="border-t p-3 flex gap-2 items-center">
                {/* Image upload */}
                <label className="cursor-pointer rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0">
                  {uploadingImg === "customer" ? "⏳" : "📷"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImg !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadChatImage(file, "customer");
                      e.target.value = "";
                    }}
                  />
                </label>
                {/* Product card */}
                <button
                  onClick={() => openCatalog("chat-customer")}
                  className="rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0"
                  title="Отправить карточку товара"
                >
                  📦
                </button>
                <input
                  type="text"
                  value={customerMsgText}
                  onChange={(e) => setCustomerMsgText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendCustomerMessage()}
                  placeholder="Сообщение клиенту..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => sendCustomerMessage()}
                  disabled={sendingCustomerMsg || (!customerMsgText.trim() && uploadingImg === null)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  {sendingCustomerMsg ? "..." : "→"}
                </button>
              </div>
            </>
          )}

          {/* ── Picker sub-tab ── */}
          {chatSubTab === "picker" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-slate-400 text-sm mt-8">
                    Чат со сборщиком пустой.
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
                      <div>{renderMsgContent(msg.text)}</div>
                      <div className="text-xs mt-0.5 opacity-60">{formatDate(msg.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={pickerChatEndRef} />
              </div>
              <div className="border-t p-3 flex gap-2 items-center">
                {/* Image upload */}
                <label className="cursor-pointer rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0">
                  {uploadingImg === "picker" ? "⏳" : "📷"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImg !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadChatImage(file, "picker");
                      e.target.value = "";
                    }}
                  />
                </label>
                {/* Product card */}
                <button
                  onClick={() => openCatalog("chat-picker")}
                  className="rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0"
                  title="Отправить карточку товара"
                >
                  📦
                </button>
                <input
                  type="text"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendPickerMessage()}
                  placeholder="Сообщение сборщику..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => sendPickerMessage()}
                  disabled={sendingMsg || (!msgText.trim() && uploadingImg === null)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                >
                  {sendingMsg ? "..." : "→"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
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
                      {log.fromStatus && (
                        <>
                          <span className="text-slate-400">{STATUS_LABELS[log.fromStatus] || log.fromStatus}</span>
                          <span className="mx-1 text-slate-300">→</span>
                        </>
                      )}
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

      {/* ── CATALOG MODAL ── */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 no-print">
          <div className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <button
                onClick={() => setShowCatalog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
              >
                ✕
              </button>
              <h2 className="font-bold text-lg">
                {catalogMode === "order" ? "Добавить товар" :
                 catalogMode === "chat-picker" ? "Отправить карточку → Сборщик" :
                 "Отправить карточку → Клиент"}
              </h2>
            </div>

            {/* Search bar */}
            <div className="border-b px-4 py-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleCatalogSearch(e.target.value)}
                placeholder="Поиск по названию или штрихкоду..."
                className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
              />
            </div>

            {/* Body: categories + products */}
            <div className="flex flex-1 overflow-hidden">
              {/* Categories sidebar */}
              <div className="w-56 flex-shrink-0 overflow-y-auto border-r bg-slate-50 p-3">
                <button
                  onClick={() => selectCat("")}
                  className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold ${
                    !selectedCatGuid ? "bg-blue-100 text-blue-700" : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  Все товары
                </button>
                <div className="space-y-0.5">{renderCatTree()}</div>
              </div>

              {/* Products grid */}
              <div
                className="flex-1 overflow-y-auto p-4"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
                    loadMore(searchQuery, selectedCatGuid);
                  }
                }}
              >
                {searchResults.length === 0 && !loadingMore && (
                  <div className="text-center text-slate-400 py-12">Ничего не найдено</div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {searchResults.map((p) => {
                    const editItem = editItems.find((i) => i.productId === p.id);
                    const isAdded = editItem && !editItem.removed;
                    const imgUrl = getProductImageUrl(p.imagePath);
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleProductSelect(p)}
                        className={`group relative flex flex-col rounded-2xl border-2 overflow-hidden text-left transition-all hover:shadow-md ${
                          isAdded && catalogMode === "order"
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-blue-300"
                        }`}
                      >
                        {/* Image */}
                        <div className="relative aspect-square bg-slate-100 w-full">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={p.name}
                              className="h-full w-full object-contain p-2"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-3xl">🧴</div>
                          )}
                          {isAdded && catalogMode === "order" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-blue-600/80 text-white font-bold text-sm">
                              ✓ Добавлен
                            </div>
                          )}
                          {catalogMode !== "order" && (
                            <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-blue-600/80 text-white font-bold text-xs px-2 text-center">
                              Отправить карточку
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="p-2 flex-1">
                          <p className="text-xs font-semibold leading-snug line-clamp-2">{p.name}</p>
                          {p.stock !== null && (
                            <p className={`text-xs mt-0.5 ${p.stock > 0 ? "text-green-600" : "text-red-500"}`}>
                              {p.stock > 0 ? `${p.stock} шт.` : "Нет в наличии"}
                            </p>
                          )}
                          <p className="text-sm font-bold mt-1">{p.price.toLocaleString("ru-RU")} ₽</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {loadingMore && (
                  <div className="py-6 text-center text-slate-400 text-sm">Загрузка...</div>
                )}
                {hasMore && !loadingMore && (
                  <div className="py-4 text-center text-xs text-slate-400">Прокрутите вниз для загрузки</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
