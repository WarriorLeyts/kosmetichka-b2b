"use client";

import { Minus, Plus, Trash2, X, CheckCircle2, Clock, LogIn, Zap } from "lucide-react";
import { resolveImageUrl } from "@/lib/image";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "../ui/button";
import { useState } from "react";
import { SafeImage } from "./SafeImage";
import {
  effectivePriceType,
  priceFor,
  priceTypeLabel,
  rawCartTotal,
  amountUntilBigWholesale,
  BIG_WHOLESALE_THRESHOLD,
} from "@/lib/pricing";

export function CartDrawer() {
  const cart = useCartStore((state) => state.cart);
  const isCartOpen = useCartStore((state) => state.isCartOpen);
  const closeCart = useCartStore((state) => state.closeCart);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const clearCart = useCartStore((state) => state.clearCart);

  const customer = useAuthStore((state) => state.customer);

  const activePriceType = effectivePriceType(cart, customer);
  const total = rawCartTotal(cart, activePriceType);
  const remaining = amountUntilBigWholesale(cart, customer);
  const isUpgraded = activePriceType === "big_wholesale" && customer?.priceType !== "big_wholesale";

  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderResult, setOrderResult] = useState<{ orderId: number } | null>(null);

  async function checkout() {
    setLoading(true);
    setError("");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          variantName: item.variantName ?? null,
          variantImageUrl: item.variantImageUrl ?? null,
        })),
        comment,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Ошибка оформления заказа");
      return;
    }

    clearCart();
    setComment("");
    setOrderResult({ orderId: data.orderId });
  }

  function closeAndReset() {
    setOrderResult(null);
    setError("");
    closeCart();
  }

  if (!isCartOpen) return null;

  return (
    <div className="cart-overlay" onClick={closeAndReset}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        {orderResult ? (
          <div className="order-confirm">
            <div className="order-confirm-icon">
              <CheckCircle2 size={48} />
            </div>
            <h2>Заказ №{orderResult.orderId} принят</h2>
            <div className="order-confirm-status">
              <Clock size={15} />
              Ожидает подтверждения менеджером
            </div>
            <p>
              Мы проверим наличие и цены и свяжемся с вами. В 1С:УНФ заказ
              попадёт только после подтверждения менеджером — это обычная
              проверка перед отправкой на склад, а не автоматическая выгрузка.
            </p>
            <button className="checkout-button" onClick={closeAndReset}>
              Продолжить покупки
            </button>
          </div>
        ) : (
          <>
            <div className="cart-header">
              <div>
                <h2>Корзина</h2>
                <p>{cart.length} позиций</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={closeAndReset}
                className="flex h-11 w-11 items-center justify-center rounded-xl"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-empty">
                <p>Корзина пустая</p>
              </div>
            ) : (
              <>
                <div className="cart-list">
                  {cart.map((item) => {
                    // Show variant image if available, otherwise product image
                    const imagePath = item.variantImageUrl
                      ? item.variantImageUrl
                      : item.images?.[0]?.path
                      ? resolveImageUrl(item.images[0].path)
                      : null;

                    const price = priceFor(item, activePriceType);
                    const cartKey = item.cartKey || String(item.id);

                    return (
                      <div className="cart-item" key={cartKey}>
                        <div className="cart-item-image">
                          {item.variantImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.variantImageUrl}
                              alt={item.variantName || item.name}
                              className="h-full w-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <SafeImage
                              src={imagePath}
                              alt={item.name}
                              placeholderText="Фото"
                              placeholderIconSize={16}
                            />
                          )}
                        </div>

                        <div className="cart-item-info">
                          <h3>{item.name}</h3>
                          {item.variantName && (
                            <p className="text-xs font-semibold text-purple-600 mb-0.5">
                              🎨 {item.variantName}
                            </p>
                          )}
                          <p>
                            {price.toLocaleString("ru-RU")} ₽
                            <span className="cart-item-line-total">
                              {(price * item.quantity).toLocaleString("ru-RU")} ₽
                            </span>
                          </p>

                          <div className="cart-qty">
                            <button onClick={() => decreaseQuantity(cartKey)}>
                              <Minus size={14} />
                            </button>
                            <span>{item.quantity}</span>
                            <button onClick={() => increaseQuantity(cartKey)}>
                              <Plus size={14} />
                            </button>
                            <button
                              className="cart-remove flex h-11 w-11 items-center justify-center rounded-xl"
                              onClick={() => removeFromCart(cartKey)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="cart-footer">
                  {!customer && (
                    <div className="cart-guest-note">
                      Цены показаны без скидки за опт. Войдите в аккаунт,
                      чтобы видеть оптовые цены.
                    </div>
                  )}

                  {isUpgraded && (
                    <div className="cart-upgrade-banner">
                      <Zap size={16} className="flex-shrink-0" />
                      <span>
                        Корзина от {BIG_WHOLESALE_THRESHOLD.toLocaleString("ru-RU")} ₽ — применены цены{" "}
                        <strong>«{priceTypeLabel("big_wholesale")}»</strong>!
                      </span>
                    </div>
                  )}

                  {customer && !isUpgraded && activePriceType !== "big_wholesale" && remaining > 0 && (
                    <div className="cart-progress-banner">
                      <div className="cart-progress-text">
                        <span>До крупного опта осталось</span>
                        <strong>{remaining.toLocaleString("ru-RU")} ₽</strong>
                      </div>
                      <div className="cart-progress-bar">
                        <div
                          className="cart-progress-fill"
                          style={{
                            width: `${Math.min(100, (total / BIG_WHOLESALE_THRESHOLD) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="cart-progress-hint">
                        Добавьте ещё товаров и получите цены <strong>«{priceTypeLabel("big_wholesale")}»</strong>
                      </div>
                    </div>
                  )}

                  <label className="cart-comment-label">Комментарий к заказу</label>
                  <textarea
                    className="cart-comment"
                    placeholder="Например: позвонить перед доставкой"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={2}
                  />

                  {error && <p className="cart-error">{error}</p>}

                  <div className="cart-total">
                    <span>
                      Итого
                      {customer && (
                        <span className="cart-total-pricetype">
                          {" "}({priceTypeLabel(activePriceType)})
                        </span>
                      )}
                      :
                    </span>
                    <strong>{total.toLocaleString("ru-RU")} ₽</strong>
                  </div>

                  {customer ? (
                    <button
                      onClick={checkout}
                      disabled={loading || cart.length === 0}
                      className="checkout-button disabled:opacity-50"
                    >
                      {loading ? "Оформляем..." : "Оформить заказ"}
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      onClick={closeAndReset}
                      className="checkout-button"
                    >
                      <LogIn size={18} />
                      Войти, чтобы оформить заказ
                    </Link>
                  )}

                  <button className="clear-cart-button" onClick={clearCart}>
                    Очистить корзину
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
