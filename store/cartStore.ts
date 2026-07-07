import { create } from "zustand";
import { persist } from "zustand/middleware";

type CartItem = any & {
  quantity: number;
  cartKey: string;
  variantId?: number;
  variantName?: string | null;
  variantImageUrl?: string | null;
};

type CartNotification = {
  id: number;
  message: string;
  image: string | null;
};

type CartStore = {
  cart: CartItem[];
  isCartOpen: boolean;
  notification: CartNotification | null;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  clearNotification: () => void;

  addToCart: (product: any) => void;
  addToCartWithVariant: (product: any, variant: { id: number; name: string; imageUrl: string }) => void;
  increaseQuantity: (cartKey: string) => void;
  decreaseQuantity: (cartKey: string) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  setCart: (items: CartItem[]) => void;

  cartCount: () => number;
  cartTotal: () => number;
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

      cartTotal: () => {
        return get().cart.reduce((sum, item) => {
          const price = Number(item.wholesalePrice || item.retailPrice || 0);
          return sum + price * item.quantity;
        }, 0);
      },
    }),
    {
      name: "kosmetichka-cart",
      partialize: (state) => ({ cart: state.cart }),
    }
  )
);
