"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle, MessageCircle, X, ClipboardList } from "lucide-react";
import { useOrdersNotifStore } from "@/store/ordersNotifStore";
import { useAuthStore } from "@/store/authStore";

const POLL_INTERVAL = 30_000;

export function OrderNotifications() {
  const customer = useAuthStore((state) => state.customer);
  const setStatuses = useOrdersNotifStore((state) => state.setStatuses);
  const setManagerMessages = useOrdersNotifStore((state) => state.setManagerMessages);
  const approvedIds = useOrdersNotifStore((state) => state.approvedIds);
  const pendingCount = useOrdersNotifStore((state) => state.pendingCount);
  const newMessageOrderIds = useOrdersNotifStore((state) => state.newMessageOrderIds);
  const dismissApproved = useOrdersNotifStore((state) => state.dismissApproved);
  const dismissMessage = useOrdersNotifStore((state) => state.dismissMessage);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  async function poll() {
    // Skip polling when tab is hidden
    if (document.visibilityState === "hidden") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/orders/status", { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      setStatuses(data.statuses ?? []);
      setManagerMessages(data.managerMessages ?? []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      // ignore other errors
    }
  }

  useEffect(() => {
    if (!customer) return;
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    // Resume polling immediately when user returns to the tab
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Auto-dismiss approval toasts after 8s
  useEffect(() => {
    if (approvedIds.length === 0) return;
    const timer = setTimeout(() => {
      approvedIds.forEach((id) => dismissApproved(id));
    }, 8000);
    return () => clearTimeout(timer);
  }, [approvedIds, dismissApproved]);

  // Auto-dismiss message toasts after 10s
  useEffect(() => {
    if (newMessageOrderIds.length === 0) return;
    const timer = setTimeout(() => {
      newMessageOrderIds.forEach((id) => dismissMessage(id));
    }, 10000);
    return () => clearTimeout(timer);
  }, [newMessageOrderIds, dismissMessage]);

  if (!customer) return null;

  return (
    <>
      {/* Floating pending orders FAB */}
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

      {/* Toast stack */}
      <div className="orders-toast-stack">
        {/* Approval toasts */}
        {approvedIds.map((id) => (
          <div key={`approved-${id}`} className="orders-toast orders-toast--approved">
            <CheckCircle size={18} className="orders-toast-icon orders-toast-icon--green" />
            <div className="orders-toast-body">
              <div className="orders-toast-title">Заказ подтверждён!</div>
              <div className="orders-toast-sub">Заказ №{id} одобрен менеджером</div>
            </div>
            <button className="orders-toast-close" onClick={() => dismissApproved(id)}>
              <X size={14} />
            </button>
          </div>
        ))}

        {/* New message toasts */}
        {newMessageOrderIds.map((orderId) => (
          <Link
            key={`msg-${orderId}`}
            href="/orders"
            className="orders-toast orders-toast--message"
            onClick={() => dismissMessage(orderId)}
          >
            <MessageCircle size={18} className="orders-toast-icon orders-toast-icon--purple" />
            <div className="orders-toast-body">
              <div className="orders-toast-title">Новое сообщение</div>
              <div className="orders-toast-sub">Менеджер написал по заказу №{orderId}</div>
            </div>
            <button
              className="orders-toast-close"
              onClick={(e) => { e.preventDefault(); dismissMessage(orderId); }}
            >
              <X size={14} />
            </button>
          </Link>
        ))}
      </div>
    </>
  );
}
