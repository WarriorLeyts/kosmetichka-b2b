import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CompareProduct = {
  id: number;
  name: string;
  imagePath: string | null;
  description: string | null;
  brandName: string | null;
  categoryName: string | null;
  retailPrice: number | null;
  discountPrice: number | null;
  wholesalePrice: number | null;
  bigWholesalePrice: number | null;
  stock: number | null;
  article: string | null;
  barcode: string | null;
  minOrderQty: number;
};

const MAX_COMPARE = 3;

type CompareStore = {
  items: CompareProduct[];
  add: (product: CompareProduct) => void;
  remove: (id: number) => void;
  clear: () => void;
  has: (id: number) => boolean;
  canAdd: () => boolean;
};

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      items: [],

      add: (product) => {
        const { items } = get();
        if (items.length >= MAX_COMPARE) return;
        if (items.some((p) => p.id === product.id)) return;
        set({ items: [...items, product] });
      },

      remove: (id) => {
        set({ items: get().items.filter((p) => p.id !== id) });
      },

      clear: () => set({ items: [] }),

      has: (id) => get().items.some((p) => p.id === id),

      canAdd: () => get().items.length < MAX_COMPARE,
    }),
    { name: "kosmetichka-compare" }
  )
);
