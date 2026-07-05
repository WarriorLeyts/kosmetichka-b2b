"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type CheckStatus =
  | "ok"
  | "out_of_stock"
  | "expired"
  | "bad_condition"
  | "insufficient_qty"
  | null;

type ItemState = {
  status: CheckStatus;
  availableQty: string;
  note: string;
  photos: string[]; // preview URLs (local)
  uploading: boolean;
};

type Photo = { id: number; url: string };

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  barcode: string | null;
  quantity: number;
  price: number;
  total: number;
  check: {
    status: string;
    availableQty: number | null;
    note: string | null;
  } | null;
  photos: Photo[];
};

type Message = {
  id: number;
  text: string;
  isFromPicker: boolean;
  createdAt: string;
  user: { name: string; role: string } | null;
};

type Order = {
  id: number;
  status: string;
  customer: {
    companyName: string | null;
    name: string | null;
    phone: string | null;
  };
  items: OrderItem[];
};

const CHECK_OPTIONS: {
  value: CheckStatus;
  label: string;
  active: string;
  inactive: string;
}[] = [
  {
    value: "ok",
    label: "✓ ОК",
    active: "border-green-500 bg-green-500 text-white",
    inactive: "border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-600",
  },
  {
    value: "out_of_stock",
    label: "✗ Нет",
    active: "border-red-500 bg-red-500 text-white",
    inactive: "border-slate-200 text-slate-600 hover:border-red-400 hover:text-red-600",
  },
  {
    value: "expired",
    label: "⏰ Просрочен",
    active: "border-orange-500 bg-orange-500 text-white",
    inactive: "border-slate-200 text-slate-600 hover:border-orange-400 hover:text-orange-600",
  },
  {
    value: "bad_condition",
    label: "👎 Вид",
    active: "border-yellow-500 bg-yellow-500 text-white",
    inactive: "border-slate-200 text-slate-600 hover:border-yellow-400 hover:text-yellow-600",
  },
  {
    value: "insufficient_qty",
    label: "⬇ Мало",
    active: "border-blue-500 bg-blue-500 text-white",
    inactive: "border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600",
  },
];

function getInitialState(item: OrderItem): ItemState {
  if (item.check) {
    return {
      status: item.check.status as CheckStatus,
      availableQty: item.check.availableQty?.toString() || "",
      note: item.check.note || "",
      photos: item.photos.map((p) => p.url),
      uploading: false,
    };
  }
  return { status: null, availableQty: "", note: "", photos: [], uploading: false };
}

function playBeep(type: "ok" | "issue") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === "ok" ? 880 : 440;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + (type === "ok" ? 0.1 : 0.2));
    if (type === "issue") {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(320, ctx.currentTime + 0.1);
    }
  } catch {}
}

function vibrate(type: "ok" | "issue") {
  if (!("vibrate" in navigator)) return;
  if (type === "ok") navigator.vibrate(80);
  else navigator.vibrate([100, 50, 100]);
}

function ProductImage({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex h-36 w-36 flex-shrink-0 items-center justify-center bg-slate-100 text-4xl sm:h-44 sm:w-44">
        📦
      </div>
    );
  }
  return (
    <div className="h-36 w-36 flex-shrink-0 bg-slate-100 sm:h-44 sm:w-44">
      <img
        src={url}
        alt={name}
        className="h-full w-full object-contain p-2"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function formatDate(str: string) {
  return new Date(str).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PickerOrderClient({
  order,
  imageMap,
}: {
  order: Order;
  imageMap: Record<number, string | null>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Record<number, ItemState>>(
    Object.fromEntries(order.items.map((i) => [i.id, getInitialState(i)]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"items" | "chat">("items");

  // Barcode search
  const [barcodeInput, setBarcodeInput] = useState("");
  const [highlightedItem, setHighlightedItem] = useState<number | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgCount = useRef(0);

  // Poll messages
  useEffect(() => {
    const fetchMsgs = async () => {
      const res = await fetch(`/api/picker/messages/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        const newMsgs: Message[] = data.messages;
        setMessages(newMsgs);
        if (activeTab !== "chat") {
          const newCount = newMsgs.filter((m) => !m.isFromPicker).length;
          if (newCount > lastMsgCount.current) {
            setUnread(newCount - lastMsgCount.current);
          }
          lastMsgCount.current = newCount;
        }
      }
    };
    fetchMsgs();
    pollRef.current = setInterval(fetchMsgs, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [order.id, activeTab]);

  useEffect(() => {
    if (activeTab === "chat") {
      setUnread(0);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTab, messages]);

  // Barcode search handler
  function handleBarcodeSearch(value: string) {
    setBarcodeInput(value);
    if (!value.trim()) {
      setHighlightedItem(null);
      return;
    }
    const found = order.items.find(
      (item) =>
        item.barcode?.toLowerCase() === value.toLowerCase().trim() ||
        item.productName.toLowerCase().includes(value.toLowerCase().trim())
    );
    if (found) {
      setHighlightedItem(found.id);
      itemRefs.current[found.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      vibrate("ok");
    } else {
      setHighlightedItem(null);
    }
  }

  // Barcode auto-submit on Enter (scanner guns send Enter)
  function handleBarcodeKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleBarcodeSearch(barcodeInput);
    }
  }

  function setItemStatus(itemId: number, status: CheckStatus) {
    setItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], status },
    }));
    playBeep(status === "ok" ? "ok" : "issue");
    vibrate(status === "ok" ? "ok" : "issue");
  }

  function setItemQty(itemId: number, availableQty: string) {
    setItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], availableQty },
    }));
  }

  function setItemNote(itemId: number, note: string) {
    setItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], note },
    }));
  }

  async function handlePhotoUpload(itemId: number, file: File) {
    setItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], uploading: true },
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("orderItemId", String(itemId));

      const res = await fetch("/api/picker/photos", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setItems((prev) => ({
          ...prev,
          [itemId]: {
            ...prev[itemId],
            photos: [...prev[itemId].photos, data.photo.url],
            uploading: false,
          },
        }));
      } else {
        setItems((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], uploading: false },
        }));
      }
    } catch {
      setItems((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], uploading: false },
      }));
    }
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

  const checkedCount = order.items.filter((i) => items[i.id]?.status !== null).length;
  const allChecked = checkedCount === order.items.length;

  async function handleSubmit() {
    if (!allChecked) {
      setError("Необходимо проверить все позиции");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        orderId: order.id,
        items: order.items.map((i) => ({
          itemId: i.id,
          status: items[i.id].status,
          availableQty:
            items[i.id].status === "insufficient_qty" && items[i.id].availableQty
              ? Number(items[i.id].availableQty)
              : null,
          note: items[i.id].note || null,
        })),
      };

      const res = await fetch("/api/picker/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Ошибка отправки");
        return;
      }

      router.push("/picker");
      router.refresh();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <a
          href="/picker"
          className="flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-bold hover:bg-slate-100"
        >
          ←
        </a>
        <div className="flex-1">
          <h1 className="text-2xl font-black">Заказ №{order.id}</h1>
          <div className="text-sm text-slate-500">
            {order.customer.companyName || order.customer.name || order.customer.phone}
          </div>
        </div>
        <div className="text-right text-sm text-slate-500">
          {checkedCount}/{order.items.length}
        </div>
      </div>

      {/* Barcode search */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            ref={barcodeRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => handleBarcodeSearch(e.target.value)}
            onKeyDown={handleBarcodeKey}
            placeholder="Штрихкод или название товара..."
            className="w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        {barcodeInput && (
          <button
            onClick={() => { setBarcodeInput(""); setHighlightedItem(null); }}
            className="rounded-xl border px-3 py-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab("items")}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
            activeTab === "items" ? "bg-white shadow" : "text-slate-500"
          }`}
        >
          📦 Товары
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all relative ${
            activeTab === "chat" ? "bg-white shadow" : "text-slate-500"
          }`}
        >
          💬 Чат
          {unread > 0 && (
            <span className="absolute -top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
              {unread}
            </span>
          )}
        </button>
      </div>

      {/* Items */}
      {activeTab === "items" && (
        <div className="space-y-4">
          {order.items.map((item) => {
            const state = items[item.id];
            const currentStatus = state?.status ?? null;
            const imageUrl = imageMap[item.productId] ?? null;
            const isHighlighted = highlightedItem === item.id;

            const borderColor =
              isHighlighted
                ? "border-yellow-400 shadow-lg"
                : currentStatus === null
                ? "border-slate-200"
                : currentStatus === "ok"
                ? "border-green-400"
                : "border-orange-400";

            return (
              <div
                key={item.id}
                ref={(el) => { itemRefs.current[item.id] = el; }}
                className={`overflow-hidden rounded-2xl border-2 bg-white transition-all ${borderColor} ${
                  isHighlighted ? "ring-2 ring-yellow-300" : ""
                }`}
              >
                {/* Product image + info */}
                <div className="flex gap-0">
                  <ProductImage url={imageUrl} name={item.productName} />
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <div className="text-base font-bold leading-snug">{item.productName}</div>
                      {item.barcode && (
                        <div className="mt-1 text-xs text-slate-400">
                          📊 {item.barcode}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black">{item.quantity}</div>
                        <div className="text-xs text-slate-400">шт.</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{item.price} ₽</div>
                        <div className="text-xs text-slate-400">за штуку</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Check buttons */}
                <div className="border-t p-4">
                  <div className="flex flex-wrap gap-2">
                    {CHECK_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setItemStatus(item.id, opt.value)}
                        className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition-all ${
                          currentStatus === opt.value
                            ? opt.active
                            : `bg-white ${opt.inactive}`
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Qty input */}
                  {currentStatus === "insufficient_qty" && (
                    <div className="mt-3 flex items-center gap-3">
                      <label className="text-sm font-bold text-blue-700">Есть:</label>
                      <input
                        type="number"
                        min="0"
                        max={item.quantity - 1}
                        value={state.availableQty}
                        onChange={(e) => setItemQty(item.id, e.target.value)}
                        placeholder={`из ${item.quantity}`}
                        className="w-24 rounded-xl border-2 border-blue-300 px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-500">шт.</span>
                    </div>
                  )}

                  {/* Note */}
                  {currentStatus !== null && currentStatus !== "ok" && (
                    <input
                      type="text"
                      value={state.note}
                      onChange={(e) => setItemNote(item.id, e.target.value)}
                      placeholder="Комментарий (необязательно)"
                      className="mt-3 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  )}

                  {/* Photo capture */}
                  {currentStatus !== null && currentStatus !== "ok" && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-slate-400">
                          {state.uploading ? "⏳ Загрузка..." : "📷 Фото"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={state.uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(item.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {state.photos.map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt=""
                              className="h-12 w-12 rounded-lg object-cover border"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chat tab */}
      {activeTab === "chat" && (
        <div className="flex flex-col rounded-2xl border bg-white overflow-hidden" style={{ height: "60vh" }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-sm mt-8">
                Нет сообщений. Напишите менеджеру если есть вопросы.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isFromPicker ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                  msg.isFromPicker
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-slate-100 text-slate-800 rounded-tl-sm"
                }`}>
                  <div className="font-bold text-xs mb-0.5 opacity-70">
                    {msg.isFromPicker ? "Вы" : (msg.user?.name || "Менеджер")}
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
              placeholder="Сообщение менеджеру..."
              className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={sendingMsg || !msgText.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Submit */}
      {activeTab === "items" && (
        <div className="sticky bottom-4 mt-6">
          {error && (
            <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allChecked}
            className={`w-full rounded-2xl py-5 text-xl font-black text-white shadow-lg transition-all ${
              allChecked
                ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-95"
                : "bg-slate-300"
            } disabled:opacity-50`}
          >
            {submitting
              ? "Отправка..."
              : allChecked
              ? "✓ Завершить проверку"
              : `Проверено ${checkedCount} из ${order.items.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
