import { create } from "zustand";
import { persist } from "zustand/middleware";
import { priceFor, type PriceType } from "@/lib/pricing";
import type { CartItem, FlatProduct, RepeatOrderItem } from "@/lib/types";

type CartNotification = {
  id: number;
  message: string;
  image: string | null;
};

type VariantEntry = { id: number; name: string; imageUrl: string };

type CartStore = {
  cart: CartItem[];
  isCartOpen: boolean;
  notification: CartNotification | null;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  clearNotification: () => void;

  addToCart: (product: FlatProduct) => void;
  addToCartWithVariant: (product: FlatProduct, variant: VariantEntry) => void;
  /** Adds multiple variant quantities in a single Zustand set() — no re-render per item */
  addVariantsBatch: (product: FlatProduct, entries: Array<{ variant: VariantEntry; quantity: number }>) => void;
  /** Repeats a previous order — merges all items into current cart in one set() */
  repeatOrder: (items: RepeatOrderItem[]) => void;
  increaseQuantity: (cartKey: string) => void;
  decreaseQuantity: (cartKey: string) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  setCart: (items: CartItem[]) => void;

  cartCount: () => number;
  /** Approximate total using wholesale price (for display; for exact total use rawCartTotal from lib/pricing). */
  cartTotal: () => number;
  /** Exact total for a specific price tier — use with effectivePriceType() for accuracy. */
  cartTotalFor: (priceType: PriceType) => number;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      cart: [],
      isCartOpen: false,
      notification: null,

      openCart: () => set({ isCartOpen: true }),
      closeCart: () => set({ isCartOpen: false }),
      toggleCart: () => set({ isCartOpen: !get().isCartOpen }),
      clearNotification: () => set({ notification: null }),

      addToCart: (product) => {
        const cart = get().cart;
        const key = String(product.id);
        const exists = cart.find((item) => item.cartKey === key);

        const notification = {
          id: Date.now(),
          message: `${product.name} — добавлен в корзину`,
          image: product.images?.[0]?.path ? "/1c/" + product.images[0].path : null,
        };

        if (exists) {
          set({
            cart: cart.map((item) =>
              item.cartKey === key ? { ...item, quantity: item.quantity + 1 } : item
            ),
            notification,
          });
          return;
        }

        set({
          cart: [...cart, { ...product, cartKey: key, quantity: 1 }],
          notification,
        });
      },

      addToCartWithVariant: (product, variant) => {
        const cart = get().cart;
        const key = `${product.id}_v${variant.id}`;
        const exists = cart.find((item) => item.cartKey === key);

        const notification = {
          id: Date.now(),
          message: `${product.name} (${variant.name}) — добавлен в корзину`,
          image: variant.imageUrl || (product.images?.[0]?.path ? "/1c/" + product.images[0].path : null),
        };

        if (exists) {
          set({
            cart: cart.map((item) =>
              item.cartKey === key ? { ...item, quantity: item.quantity + 1 } : item
            ),
            notification,
          });
          return;
        }

        set({
          cart: [
            ...cart,
            {
              ...product,
              cartKey: key,
              quantity: 1,
              variantId: variant.id,
              variantName: variant.name,
              variantImageUrl: variant.imageUrl,
            },
          ],
          notification,
        });
      },

      addVariantsBatch: (product, entries) => {
        const cart = [...get().cart];

        for (const { variant, quantity } of entries) {
          const key = `${product.id}_v${variant.id}`;
          const idx = cart.findIndex((item) => item.cartKey === key);

          if (idx >= 0) {
            cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + quantity };
          } else {
            cart.push({
              ...product,
              cartKey: key,
              quantity,
              variantId: variant.id,
              variantName: variant.name,
              variantImageUrl: variant.imageUrl,
            });
          }
        }

        const totalQty = entries.reduce((s, e) => s + e.quantity, 0);
        const first = entries[0]?.variant;
        const notification: CartNotification = {
          id: Date.now(),
          message:
            entries.length === 1
              ? `${product.name} (${first?.name}) ×${entries[0].quantity} — в корзине`
              : `${product.name}: ${totalQty} шт. добавлено в корзину`,
          image:
            first?.imageUrl ||
            (product.images?.[0]?.path ? "/1c/" + product.images[0].path : null),
        };

        set({ cart, notification });
      },

      repeatOrder: (items) => {
        const cart = [...get().cart];

        for (const item of items) {
          const key = item.variantId
            ? `${item.productId}_v${item.variantId}`
            : String(item.productId);
          const idx = cart.findIndex((c) => c.cartKey === key);

          if (idx >= 0) {
            cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + item.quantity };
          } else {
            cart.push({
              id: item.productId,
              name: item.productName,
              cartKey: key,
              quantity: item.quantity,
              // Map price so cartTotal() can compute the running total
              wholesalePrice: item.price,
              retailPrice: item.price,
              barcode: item.barcode ?? null,
              variantId: item.variantId ?? undefined,
              variantName: item.variantName ?? null,
              variantImageUrl: item.variantImageUrl ?? null,
              images: item.imagePath ? [{ path: item.imagePath }] : [],
            });
          }
        }

        set({
          cart,
          isCartOpen: true,
          notification: {
            id: Date.now(),
            message: `${items.length} позиций добавлено в корзину`,
            image: null,
          },
        });
      },

      increaseQuantity: (cartKey) => {
        set({
          cart: get().cart.map((item) =>
            item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item
          ),
        });
      },

      decreaseQuantity: (cartKey) => {
        set({
          cart: get()
            .cart.map((item) =>
              item.cartKey === cartKey ? { ...item, quantity: item.quantity - 1 } : item
            )
            .filter((item) => item.quantity > 0),
        });
      },

      removeFromCart: (cartKey) => {
        set({
          cart: get().cart.filter((item) => item.cartKey !== cartKey),
        });
      },

      clearCart: () => {
        set({ cart: [] });
      },

      setCart: (items) => {
        set({ cart: items, isCartOpen: true });
      },

      cartCount: () => {
        return get().cart.reduce((sum, item) => sum + item.quantity, 0);
      },

      // Приблизительная сумма по оптовой цене. Для точного расчёта используйте
      // rawCartTotal(cart, effectivePriceType(cart, customer)) из lib/pricing.ts.
      cartTotal: () => {
        return get().cart.reduce((sum, item) => {
          // Priority: wholesale → discount → retail → big_wholesale → 0
          // Wholesale is the default tier for this B2B store (fixes T-22)
          const price = Number(
            item.wholesalePrice ??
            item.discountPrice ??
            item.retailPrice ??
            item.bigWholesalePrice ??
            0
          );
          return sum + price * item.quantity;
        }, 0);
      },

      cartTotalFor: (priceType) => {
        return get().cart.reduce(
          (sum, item) => sum + priceFor(item, priceType) * item.quantity,
          0
        );
      },
    }),
    {
      name: "kosmetichka-cart",
      partialize: (state) => ({ cart: state.cart }),
    }
  )
);
