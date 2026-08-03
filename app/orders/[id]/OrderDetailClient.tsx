"use client";

import { useCartStore } from "@/store/cartStore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RotateCcw, FileText, ArrowLeft } from "lucide-react";
import { OrderChat } from "@/components/orders/OrderChat";
import { CancelOrderButton } from "@/components/orders/CancelOrderButton";

type OrderItem = {
  id: number;
  productId: number;
  productName: string;
  variantName: string | null;
  barcode: string | null;
  quantity: number;
  price: number;
  total: number;
};

type Order = {
  id: number;
  status: string;
  total: number;
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
};

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
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  assembly: "bg-indigo-100 text-indigo-700",
  consultation: "bg-orange-100 text-orange-700",
  payment: "bg-green-100 text-green-700",
  exported: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function OrderDetailClient({ order }: { order: Order }) {
  const repeatOrder = useCartStore((s) => s.repeatOrder);
  const router = useRouter();

  function handleRepeat() {
    repeatOrder(
      order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        variantName: item.variantName,
      }))
    );
    router.push("/catalog");
  }

  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const statusClass = STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-600";
  const createdAt = new Date(order.createdAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/orders"
            className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-800">Заказ №{order.id}</h1>
            <p className="text-sm text-slate-400">{createdAt}</p>
          </div>
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        {/* Items */}
        <div className="mb-4 rounded-2xl border bg-white">
          <div className="border-b px-5 py-3">
            <h2 className="font-bold text-slate-700">Состав заказа</h2>
          </div>
          <div className="divide-y">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 leading-snug">{item.productName}</p>
                  {item.variantName && (
                    <p className="text-xs text-indigo-500 mt-0.5">{item.variantName}</p>
                  )}
                  {item.barcode && (
                    <p className="font-mono text-xs text-slate-400">{item.barcode}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-800">
                    {item.total.toLocaleString("ru-RU")} ₽
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × {item.price.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t px-5 py-4">
            <span className="font-bold text-slate-700">Итого</span>
            <span className="text-lg font-black text-indigo-600">
              {order.total.toLocaleString("ru-RU")} ₽
            </span>
          </div>
        </div>

        {/* Comment */}
        {order.comment && (
          <div className="mb-4 rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">
              Комментарий
            </p>
            <p className="text-sm text-slate-600">{order.comment}</p>
          </div>
        )}

        {/* Chat with manager */}
        {!["exported", "cancelled"].includes(order.status) && (
          <div className="mb-4">
            <OrderChat orderId={order.id} />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRepeat}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 py-3 font-bold text-white"
          >
            <RotateCcw size={16} />
            Повторить заказ
          </button>
          <Link
            href={`/orders/${order.id}/invoice`}
            className="flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            <FileText size={16} />
            Счёт
          </Link>
        </div>

        {/* Cancel — only for cancellable statuses */}
        {order.status === "pending" && (
          <div className="mt-3">
            <CancelOrderButton orderId={order.id} />
          </div>
        )}
      </div>
    </div>
  );
}
