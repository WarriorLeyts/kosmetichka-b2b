"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle, X, ClipboardList } from "lucide-react";
import { useOrdersNotifStore } from "@/store/ordersNotifStore";
import { useAuthStore } from "@/store/authStore";

const POLL_INTERVAL = 30_000; // 30 seconds

export function OrderNotifications() {
  const customer = useAuthStore((state) => state.customer);
  const setStatuses = useOrdersNotifStore((state) => state.setStatuses);
  const approvedIds = useOrdersNotifStore((state) => state.approvedIds);
  const pendingCount = useOrdersNotifStore((state) => state.pendingCount);
  const dismissApproved = useOrdersNotifStore((state) => state.dismissApproved);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function poll() {
    try {
      const res = await fetch("/api/orders/status");
      if (!res.ok) return;
      const data = await res.json();
      setStatuses(data.statuses ?? []);
    } catch {
      // Silently ignore network errors
    }
  }

  useEffect(() => {
    if (!customer) return;

    // Immediate first fetch
    poll();

    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Auto-dismiss approval toasts after 8 seconds
  useEffect(() => {
    if (approvedIds.length === 0) return;
    const timer = setTimeout(() => {
      approvedIds.forEach((id) => dismissApproved(id));
    }, 8000);
    return () => clearTimeout(timer);
  }, [approvedIds, dismissApproved]);

  if (!customer) return null;

  return (
    <>
      {/* Floating pending badge on bottom-left */}
      {pendingCount > 0 && (
        <Link href="/orders" className="orders-pending-fab">
          <ClipboardList size={18} />
          <span>
            {pendingCount === 1
              ? "1 заказ ожидает подтверждения"
              : `${pendingCount} заказа ожидают подтверждения`}
          </span>
        </Link>
      )}

      {/* Approval toasts */}
      <div className="orders-toast-stack">
        {approvedIds.map((id) => (
          <div key={id} className="orders-toast">
            <CheckCircle size={18} className="orders-toast-icon" />
            <div className="orders-toast-body">
              <div className="orders-toast-title">Заказ подтверждён!</div>
              <div className="orders-toast-sub">
                Заказ №{id} одобрен менеджером
              </div>
            </div>
            <button
              className="orders-toast-close"
              onClick={() => dismissApproved(id)}
              aria-label="Закрыть"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
