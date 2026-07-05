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

type Order = {
  id: number;
  status: string;
  total: number;
  comment: string | null;
  customer: {
    companyName: string | null;
    name: string | null;
    phone: string | null;
    city: string | null;
  };
  items: OrderItem[];
  messages: Message[];
  statusLogs: StatusLog[];
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидание",
  assembly: "Сборка",
  consultation: "Консультация",
  payment: "К оплате",
  exported: "Выгружен",
  cancelled: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
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
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminOrderClient({ order: initialOrder }: { order: Order }) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [messages, setMessages] = useState<Message[]>(initialOrder.messages);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "chat" | "history">("items");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll messages every 5s when on chat tab
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
      router.refresh();
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

  function handlePrint() {
    window.print();
  }

  const transitions = TRANSITIONS[order.status] || [];
  const pipelineIndex = PIPELINE.indexOf(order.status);

  return (
    <div className="p-4 md:p-6 print:p-0">
      {/* PRINT STYLES */}
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
            onClick={handlePrint}
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
      <div className="no-print mb-6 overflow-x-auto rounded-2xl border bg-white p-4">
        <div className="flex min-w-max items-center gap-0">
          {PIPELINE.filter(s => s !== "cancelled").map((s, idx) => {
            const isDone = pipelineIndex > idx;
            const isCurrent = pipelineIndex === idx;
            const isFuture = pipelineIndex < idx;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                  isCurrent ? STATUS_COLORS[s] + " border" :
                  isDone ? "bg-slate-100 text-slate-400" :
                  "text-slate-300"
                }`}>
                  {isDone && <span>✓</span>}
                  {STATUS_LABELS[s]}
                </div>
                {idx < PIPELINE.filter(s => s !== "cancelled").length - 1 && (
                  <div className={`mx-1 text-lg ${isDone ? "text-slate-400" : "text-slate-200"}`}>›</div>
                )}
              </div>
            );
          })}
          {order.status === "cancelled" && (
            <div className="ml-4 rounded-xl bg-red-100 px-3 py-2 text-sm font-bold text-red-700 border border-red-300">
              ✕ Отменён
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {transitions.length > 0 && (
        <div className="no-print mb-6 flex flex-wrap gap-2">
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
        </div>
      )}

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

      {/* Items tab */}
      {(activeTab === "items" || true) && (
        <div className={activeTab === "items" ? "" : "hidden print:block"}>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Товар</th>
                  <th className="p-3 text-left">Штрихкод</th>
                  <th className="p-3 text-center">Кол-во</th>
                  <th className="p-3 text-right">Цена</th>
                  <th className="p-3 text-right">Сумма</th>
                  <th className="p-3 text-center no-print">Проверка</th>
                  <th className="p-3 text-center print-only">✓</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
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
                              <div className="mt-0.5 text-xs text-slate-500">
                                Есть: {check.availableQty} шт.
                              </div>
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
                  <td colSpan={4} className="p-3 text-right font-semibold">Итого:</td>
                  <td className="p-3 text-right text-lg font-black">{order.total.toLocaleString("ru-RU")} ₽</td>
                  <td colSpan={1} />
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

      {/* Chat tab */}
      {activeTab === "chat" && (
        <div className="no-print flex flex-col rounded-2xl border bg-white overflow-hidden" style={{ height: "480px" }}>
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
                  <div className={`text-xs mt-0.5 opacity-60`}>
                    {formatDate(msg.createdAt)}
                  </div>
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

      {/* History tab */}
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
    </div>
  );
}
