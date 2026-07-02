import { create } from "zustand";

export type OrderStatus = {
  id: number;
  status: string;
};

type OrdersNotifState = {
  pendingCount: number;
  statuses: OrderStatus[];
  approvedIds: number[]; // IDs that just got approved (for toast)
  setPendingCount: (count: number) => void;
  setStatuses: (statuses: OrderStatus[]) => void;
  dismissApproved: (id: number) => void;
};

export const useOrdersNotifStore = create<OrdersNotifState>((set) => ({
  pendingCount: 0,
  statuses: [],
  approvedIds: [],
  setPendingCount: (count) => set({ pendingCount: count }),
  setStatuses: (newStatuses) =>
    set((state) => {
      // Detect transitions: was pending, now approved
      const newlyApproved = newStatuses
        .filter(
          (n) =>
            n.status === "approved" &&
            state.statuses.some((s) => s.id === n.id && s.status === "pending")
        )
        .map((n) => n.id);

      return {
        statuses: newStatuses,
        pendingCount: newStatuses.filter((s) => s.status === "pending").length,
        approvedIds:
          newlyApproved.length > 0
            ? [...state.approvedIds, ...newlyApproved]
            : state.approvedIds,
      };
    }),
  dismissApproved: (id) =>
    set((state) => ({ approvedIds: state.approvedIds.filter((i) => i !== id) })),
}));
