"use client";

import { useState } from "react";
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
};

type OrderItem = {
  id: number;
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
};

type Order = {
  id: number;
  customer: {
    companyName: string | null;
    name: string | null;
    phone: string | null;
  };
  items: OrderItem[];
};

const CHECK_OPTIONS: { value: CheckStatus; label: string; color: string }[] = [
  {
    value: "ok",
    label: "✓ ОК",
    color:
      "border-green-500 bg-green-500 text-white",
  },
  {
    value: "out_of_stock",
    label: "✗ Нет в наличии",
    color: "border-red-500 bg-red-500 text-white",
  },
  {
    value: "expired",
    label: "⏰ Просрочен",
    color: "border-orange-500 bg-orange-500 text-white",
  },
  {
    value: "bad_condition",
    label: "👎 Плохой вид",
    color: "border-yellow-500 bg-yellow-500 text-white",
  },
  {
    value: "insufficient_qty",
    label: "⬇ Не хватает кол-во",
    color: "border-blue-500 bg-blue-500 text-white",
  },
];

function getInitialState(item: OrderItem): ItemState {
  if (item.check) {
    return {
      status: item.check.status as CheckStatus,
      availableQty: item.check.availableQty?.toString() || "",
      note: item.check.note || "",
    };
  }
  return { status: null, availableQty: "", note: "" };
}

export default function PickerOrderClient({ order }: { order: Order }) {
  const router = useRouter();
  const [items, setItems] = useState<Record<number, ItemState>>(
    Object.fromEntries(order.items.map((i) => [i.id, getInitialState(i)]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setItemStatus(itemId: number, status: CheckStatus) {
    setItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], status },
    }));
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

  const allChecked = order.items.every((i) => items[i.id]?.status !== null);

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
            items[i.id].status === "insufficient_qty" &&
            items[i.id].availableQty
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
      <div className="mb-4 flex items-center gap-3">
        <a
          href="/picker"
          className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100"
        >
          ←
        </a>
        <div>
          <h1 className="text-2xl font-black">Заказ №{order.id}</h1>
          <div className="text-sm text-slate-500">
            {order.customer.companyName ||
              order.customer.name ||
              order.customer.phone}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {order.items.map((item) => {
          const state = items[item.id];
          const currentStatus = state?.status ?? null;

          return (
            <div
              key={item.id}
              className={`rounded-2xl border bg-white p-4 ${
                currentStatus === null
                  ? "border-slate-200"
                  : currentStatus === "ok"
                  ? "border-green-300"
                  : "border-orange-300"
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="font-bold">{item.productName}</div>
                  {item.barcode && (
                    <div className="text-xs text-slate-400">
                      Штрихкод: {item.barcode}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-bold">{item.quantity} шт.</div>
                  <div className="text-sm text-slate-500">{item.price} ₽</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {CHECK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setItemStatus(item.id, opt.value)}
                    className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition-all ${
                      currentStatus === opt.value
                        ? opt.color
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {currentStatus === "insufficient_qty" && (
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-semibold text-blue-700">
                    Доступное количество:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={item.quantity - 1}
                    value={state.availableQty}
                    onChange={(e) => setItemQty(item.id, e.target.value)}
                    placeholder={`Из ${item.quantity} шт.`}
                    className="w-32 rounded-xl border-2 border-blue-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {currentStatus !== null && currentStatus !== "ok" && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={state.note}
                    onChange={(e) => setItemNote(item.id, e.target.value)}
                    placeholder="Комментарий (необязательно)"
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !allChecked}
          className={`w-full rounded-2xl py-4 text-lg font-black text-white transition-all ${
            allChecked
              ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              : "bg-slate-300"
          } disabled:opacity-50`}
        >
          {submitting
            ? "Отправка..."
            : allChecked
            ? "Завершить проверку"
            : `Проверено ${
                order.items.filter((i) => items[i.id]?.status !== null).length
              } из ${order.items.length}`}
        </button>
      </div>
    </div>
  );
}
