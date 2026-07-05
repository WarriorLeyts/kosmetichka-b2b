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
    label: "✗ Нет в наличии",
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
    label: "👎 Плохой вид",
    active: "border-yellow-500 bg-yellow-500 text-white",
    inactive: "border-slate-200 text-slate-600 hover:border-yellow-400 hover:text-yellow-600",
  },
  {
    value: "insufficient_qty",
    label: "⬇ Не хватает кол-во",
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
    };
  }
  return { status: null, availableQty: "", note: "" };
}

function ProductImage({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="flex h-44 w-44 flex-shrink-0 items-center justify-center bg-slate-100 text-5xl sm:h-52 sm:w-52">
        📦
      </div>
    );
  }

  return (
    <div className="h-44 w-44 flex-shrink-0 bg-slate-100 sm:h-52 sm:w-52">
      <img
        src={url}
        alt={name}
        className="h-full w-full object-contain p-2"
        onError={() => setFailed(true)}
      />
    </div>
  );
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

  const checkedCount = order.items.filter(
    (i) => items[i.id]?.status !== null
  ).length;
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
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <a
          href="/picker"
          className="flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-bold hover:bg-slate-100"
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

      {/* Items */}
      <div className="space-y-4">
        {order.items.map((item) => {
          const state = items[item.id];
          const currentStatus = state?.status ?? null;
          const imageUrl = imageMap[item.productId] ?? null;

          const borderColor =
            currentStatus === null
              ? "border-slate-200"
              : currentStatus === "ok"
              ? "border-green-400"
              : "border-orange-400";

          return (
            <div
              key={item.id}
              className={`overflow-hidden rounded-2xl border-2 bg-white transition-colors ${borderColor}`}
            >
              {/* Product image + info */}
              <div className="flex gap-0">
                {/* Image */}
                <ProductImage url={imageUrl} name={item.productName} />

                {/* Info */}
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="text-base font-bold leading-snug">
                      {item.productName}
                    </div>
                    {item.barcode && (
                      <div className="mt-1 text-xs text-slate-400">
                        Штрихкод: {item.barcode}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-black">{item.quantity}</div>
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
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-bold transition-all ${
                        currentStatus === opt.value
                          ? opt.active
                          : `bg-white ${opt.inactive}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Qty input for insufficient */}
                {currentStatus === "insufficient_qty" && (
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-sm font-bold text-blue-700">
                      Есть в наличии:
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={item.quantity - 1}
                      value={state.availableQty}
                      onChange={(e) => setItemQty(item.id, e.target.value)}
                      placeholder={`из ${item.quantity} шт.`}
                      className="w-28 rounded-xl border-2 border-blue-300 px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      <div className="sticky bottom-4 mt-6">
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
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
    </div>
  );
}
