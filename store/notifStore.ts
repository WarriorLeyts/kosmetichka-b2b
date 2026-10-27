import { create } from "zustand";

/** Unread «Уведомления» count for the header bell (same feed as the app). */
type NotifState = { unread: number; loadedFor: number | null; refresh: (customerId: number) => Promise<void>; set: (n: number) => void };

export const useNotifStore = create<NotifState>((set) => ({
  unread: 0,
  loadedFor: null,
  refresh: async (customerId) => {
    try {
      const res = await fetch("/api/mobile/notifications?count=1", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      set({ unread: Number(d.unread) || 0, loadedFor: customerId });
    } catch {
      /* offline */
    }
  },
  set: (n) => set({ unread: Math.max(0, n) }),
}));

/** App routes in notifications («/order/12») → the site's pages («/orders/12»). */
export function siteLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/")) return null;
  const m = /^\/order\/(\d+)/.exec(link);
  if (m) return `/orders/${m[1]}`;
  return link;
}
