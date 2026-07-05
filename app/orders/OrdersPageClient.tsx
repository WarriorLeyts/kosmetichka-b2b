"use client";

import { useState, useEffect, useRef } from "react";

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "На консультации",
  payment: "К оплате",
  exported: "Выполнен",
  cancelled: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  assembly: "bg-blue-100 text-blue-800",
  consultation: "bg-orange-100 text-orange-800",
  payment: "bg-green-100 text-green-800",
  exported: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-100 text-red-700",
};

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  total: number;
  imagePath?: string | null;
};

type Order = {
  id: number;
  status: string;
  total: number;
  comment?: string | null;
  createdAt: string;
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

type ProductHit = {
  id: number;
  name: string;
  price: number;
  imagePath: string | null;
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

function getProductImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `https://kosmetichka-opt.ru/api/1c/${imagePath}`;
}

function renderMsgContent(text: string, isFromManager: boolean) {
  try {
    const obj = JSON.parse(text);
    if (obj?._t === "img" && obj.url) {
      return (
        <a href={obj.url} target="_blank" rel="noreferrer">
          <img
            src={obj.url}
            alt="фото"
            className="max-w-[160px] max-h-[160px] rounded-xl object-cover cursor-pointer hover:opacity-90"
          />
        </a>
      );
    }
    if (obj?._t === "product") {
      const imgUrl = getProductImageUrl(obj.imagePath ?? null);
      return (
        <div className={`rounded-xl border overflow-hidden w-44 ${isFromManager ? "bg-white" : "bg-indigo-50"}`}>
          {imgUrl && (
            <img
              src={imgUrl}
              alt={obj.name}
              className="w-full h-20 object-contain bg-slate-50 p-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="p-2">
            <p className="font-semibold text-xs leading-snug text-slate-800">{obj.name}</p>
            {obj.price > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{Number(obj.price).toLocaleString("ru-RU")} ₽</p>
            )}
          </div>
        </div>
      );
    }
  } catch {}
  return <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>;
}

// ── Per-order chat ───────────────────────────────────────────────────────────

function OrderChat({ orderId }: { orderId: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [uploadingImg, setUploadingImg] = useState(false);

  // Product search
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductHit[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const productSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: Message[] = data.messages || [];
      if (!open) {
        const newManagerMsgs = msgs.filter((m) => m.isFromManager).length;
        if (newManagerMsgs > lastCountRef.current) setUnread(newManagerMsgs - lastCountRef.current);
      }
      setMessages(msgs);
    } catch {}
  }

  useEffect(() => {
    fetchMessages();
    const timer = setInterval(fetchMessages, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (open) {
      lastCountRef.current = messages.filter((m) => m.isFromManager).length;
      setUnread(0);
    }
  }, [open, messages]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(msgText?: string) {
    const t = (msgText ?? text).trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      if (res.ok) {
        if (!msgText) setText("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  }

  async function uploadImage(file: File) {
    setUploadingImg(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/chat", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        await send(JSON.stringify({ _t: "img", url: data.url }));
      }
    } finally {
      setUploadingImg(false);
    }
  }

  async function searchProducts(q: string) {
    setProductQuery(q);
    if (productSearchRef.current) clearTimeout(productSearchRef.current);
    if (q.length < 2) { setProductResults([]); return; }
    setSearchingProducts(true);
    productSearchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/products/search?q=${encodeURIComponent(q)}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          setProductResults(data.products ?? []);
        }
      } finally {
        setSearchingProducts(false);
      }
    }, 350);
  }

  async function sendProductCard(p: ProductHit) {
    await send(JSON.stringify({ _t: "product", id: p.id, name: p.name, price: p.price, imagePath: p.imagePath }));
    setShowProductSearch(false);
    setProductQuery("");
    setProductResults([]);
  }

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        💬 Чат с менеджером
        {unread > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{unread}</span>
        )}
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {/* Messages */}
          <div className="max-h-64 overflow-y-auto rounded-xl border bg-slate-50 p-3 flex flex-col gap-2">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-slate-400">Нет сообщений. Задайте вопрос менеджеру.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.isFromManager ? "self-start bg-white border text-slate-800" : "self-end bg-indigo-600 text-white"}`}>
                  {m.isFromManager && <p className="text-xs font-semibold text-slate-500 mb-0.5">Менеджер</p>}
                  <div>{renderMsgContent(m.text, m.isFromManager)}</div>
                  <p className={`text-xs mt-1 ${m.isFromManager ? "text-slate-400" : "text-indigo-200"}`}>
                    {new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Product search popup */}
          {showProductSearch && (
            <div className="rounded-xl border bg-white shadow-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={productQuery}
                  onChange={(e) => searchProducts(e.target.value)}
                  placeholder="Найти товар для предложения..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  autoFocus
                />
                <button onClick={() => { setShowProductSearch(false); setProductQuery(""); setProductResults([]); }} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
              </div>
              {searchingProducts && <p className="text-center text-xs text-slate-400 py-2">Поиск...</p>}
              {productResults.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {productResults.map((p) => {
                    const imgUrl = getProductImageUrl(p.imagePath);
                    return (
                      <button
                        key={p.id}
                        onClick={() => sendProductCard(p)}
                        className="flex items-center gap-2 rounded-xl border p-2 text-left text-sm hover:bg-indigo-50 hover:border-indigo-300 transition-all"
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt={p.name} className="h-10 w-10 rounded-lg object-contain bg-slate-100 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl shrink-0">🧴</div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug line-clamp-2">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.price.toLocaleString("ru-RU")} ₽</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {productQuery.length >= 2 && !searchingProducts && productResults.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-2">Ничего не найдено</p>
              )}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 items-center">
            {/* Image upload */}
            <label className="cursor-pointer rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0">
              {uploadingImg ? "⏳" : "📷"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingImg}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadImage(file);
                  e.target.value = "";
                }}
              />
            </label>
            {/* Product search button */}
            <button
              onClick={() => setShowProductSearch((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-lg hover:bg-slate-50 shrink-0 ${showProductSearch ? "bg-indigo-50 border-indigo-300" : ""}`}
              title="Предложить товар"
            >
              📦
            </button>
            <input
              className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Написать менеджеру…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              disabled={sending}
            />
            <button
              onClick={() => send()}
              disabled={sending || !text.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-indigo-700 shrink-0"
            >
              {sending ? "…" : "Отправить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single order card ────────────────────────────────────────────────────────

function OrderCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const label = STATUS_LABELS[order.status] ?? order.status;
  const colorClass = STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-700";

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-800">Заказ №{order.id}</span>
          <span className="text-sm text-slate-500">{formatDate(order.createdAt)} · {formatMoney(order.total)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}>{label}</span>
          <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-4">
          <div className="flex flex-col gap-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                {item.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imagePath.startsWith("http") ? item.imagePath : `https://kosmetichka-opt.ru/api/1c/${item.imagePath}`}
                    alt={item.productName}
                    className="h-12 w-12 rounded-lg object-cover border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg border bg-slate-100 flex items-center justify-center text-xl">🧴</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-800 truncate">{item.productName}</p>
                  {item.barcode && <p className="text-xs text-slate-400">{item.barcode}</p>}
                </div>
                <div className="text-right text-sm text-slate-700 shrink-0">
                  <p>{item.quantity} шт.</p>
                  <p className="text-slate-500">{formatMoney(item.total)}</p>
                </div>
              </div>
            ))}
          </div>

          {order.comment && (
            <p className="mt-3 text-sm text-slate-500 italic">Комментарий: {order.comment}</p>
          )}

          <OrderChat orderId={order.id} />
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function OrdersPageClient({
  orders,
  stats,
}: {
  orders: Order[];
  stats: Stats;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-12 text-center text-slate-400">
        <p className="text-4xl mb-3">📦</p>
        <p className="text-lg font-medium">У вас пока нет заказов</p>
        <a href="/catalog" className="mt-4 inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700">
          Перейти в каталог
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stats.totalOrders > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Заказов</p>
            <p className="text-xl font-bold text-slate-800">{stats.totalOrders}</p>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Сумма</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(stats.totalSum)}</p>
          </div>
          {stats.topProduct && (
            <div className="col-span-2 rounded-2xl border bg-white px-4 py-3 sm:col-span-1">
              <p className="text-xs text-slate-500">Топ товар</p>
              <p className="text-sm font-semibold text-slate-800 line-clamp-2">{stats.topProduct}</p>
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
