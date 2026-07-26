import { create } from "zustand";

export type OrderStatus = {
  id: number;
  status: string;
};

export type ManagerMessageInfo = {
  orderId: number;
  latestAt: string;
  preview: string;
};

type OrdersNotifState = {
  pendingCount: number;
  statuses: OrderStatus[];
  approvedIds: number[];           // orders just transitioned pending→approved
  newMessageOrderIds: number[];    // orders with new unread manager messages
  knownMessageTimestamps: Record<number, string>; // orderId → last seen latestAt
  setPendingCount: (count: number) => void;
  setStatuses: (statuses: OrderStatus[]) => void;
  setManagerMessages: (msgs: ManagerMessageInfo[]) => void;
  dismissApproved: (id: number) => void;
  dismissMessage: (orderId: number) => void;
  markMessageRead: (orderId: number) => void; // called when user opens chat
};

export const useOrdersNotifStore = create<OrdersNotifState>((set) => ({
  pendingCount: 0,
  statuses: [],
  approvedIds: [],
  newMessageOrderIds: [],
  knownMessageTimestamps: {},

  setPendingCount: (count) => set({ pendingCount: count }),

  setStatuses: (newStatuses) =>
    set((state) => {
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

  setManagerMessages: (msgs) =>
    set((state) => {
      const newMessageOrderIds: number[] = [];
      const updatedTimestamps = { ...state.knownMessageTimestamps };

      for (const msg of msgs) {
        const known = state.knownMessageTimestamps[msg.orderId];
        if (!known) {
          // First time seeing this order's messages — store but don't notify
          updatedTimestamps[msg.orderId] = msg.latestAt;
        } else if (msg.latestAt > known) {
          // New message arrived since last poll
          newMessageOrderIds.push(msg.orderId);
          updatedTimestamps[msg.orderId] = msg.latestAt;
        }
      }

      return {
        knownMessageTimestamps: updatedTimestamps,
        newMessageOrderIds:
          newMessageOrderIds.length > 0
            ? [
                ...state.newMessageOrderIds.filter(
                  (id) => !newMessageOrderIds.includes(id)
                ),
                ...newMessageOrderIds,
              ]
            : state.newMessageOrderIds,
      };
    }),

  dismissApproved: (id) =>
    set((state) => ({ approvedIds: state.approvedIds.filter((i) => i !== id) })),

  dismissMessage: (orderId) =>
    set((state) => ({
      newMessageOrderIds: state.newMessageOrderIds.filter((i) => i !== orderId),
    })),

  markMessageRead: (orderId) =>
    set((state) => ({
      newMessageOrderIds: state.newMessageOrderIds.filter((i) => i !== orderId),
    })),
}));
