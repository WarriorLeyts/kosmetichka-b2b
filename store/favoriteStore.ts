import { create } from "zustand";
import { persist } from "zustand/middleware";

type FavoriteStore = {
  favorites: any[];
  isFavoriteOpen: boolean;

  openFavorite: () => void;
  closeFavorite: () => void;

  toggleFavorite: (product: any) => void;
  removeFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;

  /** Merge server wishlist products into local favorites (call after wishlist loads).
   *  Adds any server products not already in the local store so favorites persist across devices. */
  syncFromWishlist: (products: any[]) => void;
};

export const useFavoriteStore = create<FavoriteStore>()(
  persist(
    (set, get) => ({
      favorites: [],
      isFavoriteOpen: false,

      openFavorite: () => set({ isFavoriteOpen: true }),
      closeFavorite: () => set({ isFavoriteOpen: false }),

      toggleFavorite: (product) => {
        const favorites = get().favorites;
        const exists = favorites.find((item) => item.id === product.id);
        set({
          favorites: exists
            ? favorites.filter((item) => item.id !== product.id)
            : [...favorites, product],
        });
      },

      removeFavorite: (id) => {
        set({
          favorites: get().favorites.filter((item) => item.id !== id),
        });
      },

      isFavorite: (id) => {
        return get().favorites.some((item) => item.id === id);
      },

      syncFromWishlist: (products: any[]) => {
        if (!products.length) return;
        const existing = get().favorites;
        const existingIds = new Set(existing.map((f) => f.id));
        const toAdd = products.filter((p) => !existingIds.has(p.id));
        if (toAdd.length === 0) return;
        set({ favorites: [...existing, ...toAdd] });
      },
    }),
    {
      name: "kosmetichka-favorites",
    }
  )
);
