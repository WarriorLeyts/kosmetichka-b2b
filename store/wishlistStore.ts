import { create } from "zustand";

type WishlistStore = {
  productIds: Set<number>;
  initialized: boolean;
  fetchWishlist: () => Promise<void>;
  toggle: (productId: number) => Promise<"added" | "removed" | "unauthorized">;
  has: (productId: number) => boolean;
};

export const useWishlistStore = create<WishlistStore>((set, get) => ({
  productIds: new Set(),
  initialized: false,

  fetchWishlist: async () => {
    if (get().initialized) return;
    try {
      const res = await fetch("/api/wishlist");
      if (res.ok) {
        const data = await res.json();
        set({ productIds: new Set(data.productIds), initialized: true });
      }
    } catch {
      // silent
    }
  },

  toggle: async (productId: number) => {
    const { productIds } = get();
    const isIn = productIds.has(productId);

    // Optimistic update
    const next = new Set(productIds);
    if (isIn) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    set({ productIds: next });

    if (isIn) {
      const res = await fetch(`/api/wishlist?productId=${productId}`, { method: "DELETE" });
      if (!res.ok) {
        // rollback
        const rb = new Set(get().productIds);
        rb.add(productId);
        set({ productIds: rb });
      }
      return "removed";
    } else {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.status === 401) {
        // rollback + signal unauthorized
        const rb = new Set(get().productIds);
        rb.delete(productId);
        set({ productIds: rb });
        return "unauthorized";
      }
      if (!res.ok) {
        const rb = new Set(get().productIds);
        rb.delete(productId);
        set({ productIds: rb });
      }
      return "added";
    }
  },

  has: (productId: number) => get().productIds.has(productId),
}));
