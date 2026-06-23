"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export function CancelOrderButton({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function cancelOrder() {
    setConfirmOpen(false);
    setLoading(true);
    setError("");

    const res = await fetch(`/api/orders/${orderId}/cancel`, {
      method: "POST",
    });

    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Не удалось отменить заказ");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        className="order-cancel-button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
      >
        <X size={15} />
        {loading ? "Отменяем..." : "Отменить заказ"}
      </button>

      {error && <p className="cart-error order-cancel-error">{error}</p>}

      <ConfirmModal
        open={confirmOpen}
        title="Отменить заказ?"
        message="Заказ будет убран из очереди на подтверждение менеджером. Это действие можно будет повторить и отредактировать позже."
        confirmLabel="Отменить заказ"
        cancelLabel="Не отменять"
        danger
        onConfirm={cancelOrder}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
