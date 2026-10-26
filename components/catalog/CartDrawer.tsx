"use client";

import { Minus, Plus, Trash2, X, CheckCircle2, Clock, LogIn, Zap } from "lucide-react";
import { resolveImageUrl } from "@/lib/image";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "../ui/button";
import { useState, useEffect, useRef } from "react";
import { SafeImage } from "./SafeImage";
import {
  effectivePriceType,
  priceFor,
  priceTypeLabel,
  rawCartTotal,
  resolveCustomerPriceType,
  amountUntilWholesale,
  amountUntilBigWholesale,
  WHOLESALE_THRESHOLD,
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

  const base = resolveCustomerPriceType(customer);
  const activePriceType = effectivePriceType(cart, customer);
  const wholesaleCartTotal = rawCartTotal(cart, "wholesale");
  const total = rawCartTotal(cart, activePriceType);
  const remainingToWholesale = amountUntilWholesale(cart, customer);
  const remainingToBigWholesale = amountUntilBigWholesale(cart, customer);

  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderResult, setOrderResult] = useState<{ orderId: number } | null>(null);

  // Promo code (MAXMA): checked by /api/promo/check, re-checked when the cart changes
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const promoReq = useRef(0);
  const cartSignature = cart.map((i) => `${i.cartKey || i.id}:${i.quantity}`).join(",");
  const promoTotal = promo ? Math.max(0, total - promo.discount) : total;

  async function checkPromo(code: string, recheck = false) {
    const req = ++promoReq.current;
    setPromoLoading(true);
    if (!recheck) setPromoError("");
    let ok = false;
    let message = "Не удалось проверить промокод";
    let discount = 0;
    try {
      const res = await fetch("/api/promo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          items: useCartStore.getState().cart.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            variantName: item.variantName ?? null,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      ok = res.ok && data?.ok;
      if (ok) discount = Number(data.discount) || 0;
      else if (data?.error) message = data.error;
    } catch {
      // network error — message stays generic
    }
    if (req !== promoReq.current) return; // a newer check is running
    setPromoLoading(false);
    if (ok) {
      setPromo({ code, discount });
      setPromoError("");
    } else {
      setPromo(null);
      setPromoError(recheck ? `Промокод ${code} больше не применяется: ${message}` : message);
    }
  }

  function removePromo() {
    promoReq.current++;
    setPromo(null);
    setPromoInput("");
    setPromoError("");
    setPromoLoading(false);
  }

  // Cart changed → re-check the applied promo code (debounced)
  const appliedCode = promo?.code ?? null;
  useEffect(() => {
    if (!appliedCode) return;
    const empty = cart.length === 0;
    const t = setTimeout(() => (empty ? removePromo() : checkPromo(appliedCode, true)), empty ? 0 : 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  // Animation state: keep drawer mounted during closing animation
  const [visible, setVisible] = useState(isCartOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isCartOpen) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 270);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCartOpen]);

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
        ...(promo ? { promocode: promo.code } : {}),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Ошибка оформления заказа");
      // The server rejected the promo code — drop it so the order can go without it
      if (promo && res.status === 400 && String(data.error ?? "").startsWith("Промокод:")) removePromo();
      return;
    }

    clearCart();
    setComment("");
    removePromo();
    setOrderResult({ orderId: data.orderId });
  }

  function closeAndReset() {
    setOrderResult(null);
    setError("");
    closeCart();
  }

  if (!visible) return null;

  return (
    <div
      className={`cart-overlay ${closing ? "cart-overlay--closing" : "cart-overlay--open"}`}
      onClick={closeAndReset}
    >
      <aside
        className={`cart-drawer ${closing ? "cart-drawer--closing" : "cart-drawer--open"}`}
        onClick={(e) => e.stopPropagation()}
      >
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
                      ? resolveImageUrl(item.images[0].path, 160)
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

                  {/* === Tier 1: progress toward Опт (только оптовые клиенты) === */}
                  {customer && base === "wholesale" && activePriceType === "discount" && remainingToWholesale > 0 && (
                    <div className="cart-progress-banner">
                      <div className="cart-progress-text">
                        <span>До оптовых цен осталось</span>
                        <strong>{remainingToWholesale.toLocaleString("ru-RU")} ₽</strong>
                      </div>
                      <div className="cart-progress-bar">
                        <div
                          className="cart-progress-fill"
                          style={{
                            width: `${Math.min(100, (wholesaleCartTotal / WHOLESALE_THRESHOLD) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="cart-progress-hint">
                        Добавьте ещё товаров и получите цены <strong>«{priceTypeLabel("wholesale")}»</strong>
                      </div>
                    </div>
                  )}

                  {/* === Tier 1 achieved: Опт activated === */}
                  {customer && base === "wholesale" && activePriceType === "wholesale" && (
                    <div className="cart-upgrade-banner">
                      <Zap size={16} className="flex-shrink-0" />
                      <span>
                        Сумма от {WHOLESALE_THRESHOLD.toLocaleString("ru-RU")} ₽ — применены цены{" "}
                        <strong>«{priceTypeLabel("wholesale")}»</strong>!
                      </span>
                    </div>
                  )}

                  {/* === Tier 2: progress toward Крупный опт === */}
                  {customer && base === "wholesale" && activePriceType === "wholesale" && remainingToBigWholesale > 0 && (
                    <div className="cart-progress-banner">
                      <div className="cart-progress-text">
                        <span>До крупного опта осталось</span>
                        <strong>{remainingToBigWholesale.toLocaleString("ru-RU")} ₽</strong>
                      </div>
                      <div className="cart-progress-bar">
                        <div
                          className="cart-progress-fill"
                          style={{
                            width: `${Math.min(100, (wholesaleCartTotal / BIG_WHOLESALE_THRESHOLD) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="cart-progress-hint">
                        Добавьте ещё товаров и получите цены <strong>«{priceTypeLabel("big_wholesale")}»</strong>
                      </div>
                    </div>
                  )}

                  {/* === Tier 2 achieved: Крупный опт activated === */}
                  {customer && base === "wholesale" && activePriceType === "big_wholesale" && (
                    <div className="cart-upgrade-banner">
                      <Zap size={16} className="flex-shrink-0" />
                      <span>
                        Сумма от {BIG_WHOLESALE_THRESHOLD.toLocaleString("ru-RU")} ₽ — применены цены{" "}
                        <strong>«{priceTypeLabel("big_wholesale")}»</strong>!
                      </span>
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
                    <strong>{promoTotal.toLocaleString("ru-RU")} ₽</strong>
                  </div>

                  {/* Promo code — only for logged-in customers (guests can't check out) */}
                  {customer && (
                    <div className="cart-promo">
                      {promo ? (
                        <div className="cart-promo-applied">
                          <span>
                            Скидка по промокоду <b>{promo.code}</b>: −{promo.discount.toLocaleString("ru-RU")} ₽
                            <span className="cart-promo-subtotal">
                              {" "}(без скидки {total.toLocaleString("ru-RU")} ₽)
                            </span>
                          </span>
                          <button type="button" className="cart-promo-remove" onClick={removePromo}>
                            Убрать
                          </button>
                        </div>
                      ) : (
                        <>
                          <label className="cart-comment-label" htmlFor="cart-promo-input">Промокод</label>
                          <form
                            className="cart-promo-row"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const code = promoInput.trim();
                              if (code && !promoLoading) checkPromo(code);
                            }}
                          >
                            <input
                              id="cart-promo-input"
                              className="cart-promo-input"
                              value={promoInput}
                              onChange={(e) => {
                                setPromoInput(e.target.value);
                                if (promoError) setPromoError("");
                              }}
                              placeholder="Введите промокод"
                              autoComplete="off"
                              maxLength={64}
                            />
                            <button
                              type="submit"
                              className="cart-promo-apply"
                              disabled={promoLoading || !promoInput.trim()}
                            >
                              {promoLoading ? "…" : "Применить"}
                            </button>
                          </form>
                        </>
                      )}
                      {promoError && <p className="cart-promo-error">{promoError}</p>}
                    </div>
                  )}

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
