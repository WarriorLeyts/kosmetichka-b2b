"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { SafeImage } from "./SafeImage";

export function CartToast() {
  const notification = useCartStore((state) => state.notification);
  const clearNotification = useCartStore((state) => state.clearNotification);
  const cart = useCartStore((state) => state.cart);
  const customer = useAuthStore((state) => state.customer);

  const total = cart.reduce((sum, item) => {
    const price = customer
      ? Number(item.wholesalePrice || item.retailPrice || 0)
      : Number(item.discountPrice ?? item.retailPrice ?? 0);
    return sum + price * item.quantity;
  }, 0);

  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      clearNotification();
    }, 2500);

    return () => clearTimeout(timer);
  }, [notification?.id, clearNotification]);

  if (!notification) return null;

  return (
    <div className="cart-toast" role="status">
      <div className="cart-toast-image">
        <SafeImage
          src={notification.image}
          alt=""
          placeholderText=""
          placeholderIconSize={16}
        />
      </div>

      <div className="cart-toast-body">
        <div className="cart-toast-title">
          <CheckCircle2 size={16} />
          <strong>{notification.message}</strong>
        </div>
        <span>Сумма корзины: {total.toLocaleString("ru-RU")} ₽</span>
      </div>
    </div>
  );
}
