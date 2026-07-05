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
  customerConfirmed: boolean;
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

// ── Per-order chat component ─────────────────────────────────────────────────

function OrderChat({ orderId }: { orderId: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: Message[] = data.messages || [];
      // Count new manager messages since last open
      if (!open) {
        const newManagerMsgs = msgs.filter((m) => m.isFromManager).length;
        if (newManagerMsgs > lastCountRef.current) {
          setUnread(newManagerMsgs - lastCountRef.current);
        }
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
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        setText("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
      >
        💬 Чат с менеджером
        {unread > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">
            {unread}
          </span>
        )}
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {/* Messages */}
          <div className="max-h-60 overflow-y-auto rounded-xl border bg-slate-50 p-3 flex flex-col gap-2">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-slate-400">
                Нет сообщений. Задайте вопрос менеджеру.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    m.isFromManager
                      ? "self-start bg-white border text-slate-800"
                      : "self-end bg-indigo-600 text-white"
                  }`}
                >
                  {m.isFromManager && (
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">
                      Менеджер
                    </p>
                  )}
                  <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                  <p
                    className={`text-xs mt-1 ${
                      m.isFromManager ? "text-slate-400" : "text-indigo-200"
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Написать менеджеру…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-indigo-700"
            >
              {sending ? "…" : "Отправить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confirm substitutions button ─────────────────────────────────────────────

function ConfirmButton({ orderId, initialConfirmed }: { orderId: number; initialConfirmed: boolean }) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [loading, setLoading] = useState(false);

  if (confirmed) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
        <span className="text-green-600 text-sm font-semibold">✓ Замены подтверждены</span>
        <span className="text-xs text-green-500">Менеджер переведёт заказ к оплате</span>
      </div>
    );
  }

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm`, { method: "POST" });
      if (res.ok) setConfirmed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
      <p className="text-sm text-orange-800 font-medium mb-1">Менеджер внёс изменения в заказ</p>
      <p className="text-xs text-orange-600 mb-3">
        Проверьте состав и подтвердите замены, чтобы продолжить оформление.
      </p>
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {loading ? "…" : "✓ Подтвердить изменения"}
      </button>
    </div>
  );
}

// ── Single order card ────────────────────────────────────────────────────────

function OrderCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const label = STATUS_LABELS[order.status] ?? order.status;
  const colorClass =
    STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-700";

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-800">
            Заказ №{order.id}
          </span>
          <span className="text-sm text-slate-500">
            {formatDate(order.createdAt)} · {formatMoney(order.total)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {order.status === "consultation" && !order.customerConfirmed && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
              Ждёт подтверждения
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}
          >
            {label}
          </span>
          <span className="text-slate-400">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-4">
          {/* Items */}
          <div className="flex flex-col gap-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                {item.imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      item.imagePath.startsWith("http")
                        ? item.imagePath
                        : `https://kosmetichka-opt.ru/api/1c/${item.imagePath}`
                    }
                    alt={item.productName}
                    className="h-12 w-12 rounded-lg object-cover border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg border bg-slate-100 flex items-center justify-center text-xl">
                    🧴
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-800 truncate">
                    {item.productName}
                  </p>
                  {item.barcode && (
                    <p className="text-xs text-slate-400">{item.barcode}</p>
                  )}
                </div>
                <div className="text-right text-sm text-slate-700 shrink-0">
                  <p>{item.quantity} шт.</p>
                  <p className="text-slate-500">{formatMoney(item.total)}</p>
                </div>
              </div>
            ))}
          </div>

          {order.comment && (
            <p className="mt-3 text-sm text-slate-500 italic">
              Комментарий: {order.comment}
            </p>
          )}

          {/* Confirm substitutions (consultation only) */}
          {order.status === "consultation" && (
            <ConfirmButton
              orderId={order.id}
              initialConfirmed={order.customerConfirmed}
            />
          )}

          {/* Chat with manager */}
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
        <a
          href="/catalog"
          className="mt-4 inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Перейти в каталог
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats row */}
      {stats.totalOrders > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Заказов</p>
            <p className="text-xl font-bold text-slate-800">
              {stats.totalOrders}
            </p>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Сумма</p>
            <p className="text-xl font-bold text-slate-800">
              {formatMoney(stats.totalSum)}
            </p>
          </div>
          {stats.topProduct && (
            <div className="col-span-2 rounded-2xl border bg-white px-4 py-3 sm:col-span-1">
              <p className="text-xs text-slate-500">Топ товар</p>
              <p className="text-sm font-semibold text-slate-800 line-clamp-2">
                {stats.topProduct}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Orders list */}
      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}
