import { create } from "zustand";
import { persist } from "zustand/middleware";

type CartItem = any & {
quantity: number;
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
increaseQuantity: (id: number) => void;
decreaseQuantity: (id: number) => void;
removeFromCart: (id: number) => void;
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
toggleCart: () =>
set({
isCartOpen: !get().isCartOpen,
}),
clearNotification: () => set({ notification: null }),

addToCart: (product) => {
const cart = get().cart;
const exists = cart.find((item) => item.id === product.id);

const notification = {
id: Date.now(),
message: `«${product.name}» добавлен в корзину`,
image: product.images?.[0]?.path ? "/1c/" + product.images[0].path : null,
};

if (exists) {
set({
cart: cart.map((item) =>
item.id === product.id
? { ...item, quantity: item.quantity + 1 }
: item
),
notification,
});

return;
}

set({
cart: [...cart, { ...product, quantity: 1 }],
notification,
});
},

increaseQuantity: (id) => {
set({
cart: get().cart.map((item) =>
item.id === id
? { ...item, quantity: item.quantity + 1 }
: item
),
});
},

decreaseQuantity: (id) => {
set({
cart: get()
.cart.map((item) =>
item.id === id
? { ...item, quantity: item.quantity - 1 }
: item
)
.filter((item) => item.quantity > 0),
});
},

removeFromCart: (id) => {
set({
cart: get().cart.filter((item) => item.id !== id),
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
// Only persist the actual cart contents — isCartOpen/notification are
// transient UI state and shouldn't survive a reload (a stale toast
// popping back up after closing the tab would be confusing).
partialize: (state) => ({ cart: state.cart }),
}
)
);