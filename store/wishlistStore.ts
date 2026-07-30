import { create } from "zustand";

type WishlistStore = {
  productIds: number[];
  loaded: boolean;
  /** Load wishlist from server (call once after auth) */
  load: () => Promise<void>;
  /** Toggle wishlist membership for a product; returns true if added */
  toggle: (productId: number) => Promise<boolean>;
  isInWishlist: (productId: number) => boolean;
  clear: () => void;
};

export const useWishlistStore = create<WishlistStore>((set, get) => ({
  productIds: [],
  loaded: false,

  load: async () => {
    try {
      const res = await fetch("/api/wishlist");
      if (!res.ok) return;
      const data = await res.json();
      set({ productIds: data.productIds ?? [], loaded: true });
    } catch {}
  },

  toggle: async (productId: number) => {
    const current = get().productIds;
    const inList = current.includes(productId);

    // Optimistic update
    set({
      productIds: inList
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    });

    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) {
        // Roll back
        set({ productIds: current });
        return inList;
      }
      const data = await res.json();
      return data.added as boolean;
    } catch {
      // Roll back
      set({ productIds: current });
      return inList;
    }
  },

  isInWishlist: (productId: number) => get().productIds.includes(productId),

  clear: () => set({ productIds: [], loaded: false }),
}));
