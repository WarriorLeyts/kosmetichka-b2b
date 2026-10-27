"use client";

import { Minus, Plus, Trash2, X, CheckCircle2, Clock, LogIn } from "lucide-react";
import { resolveImageUrl } from "@/lib/image";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { Button } from "../ui/button";
import { useState, useEffect, useRef } from "react";
import { SafeImage } from "./SafeImage";
import { SITE_RETAIL_ENABLED } from "@/lib/siteMode";
import {
  effectivePriceType,
  priceFor,
  priceTypeLabel,
  rawCartTotal,
  resolveCustomerPriceType,
  amountUntilMinOrder,
  minOrderFor,
} from "@/lib/pricing";

type CalcBonuses = { canSpend: boolean; balance: number | null; maxToApply: number; applied: number; collected: number };
type CalcResponse = {
  error?: string;
  subtotal: number;
  promo: { code: string; name: string | null; discount: number } | null;
  promoError?: string;
  bonuses: CalcBonuses | null;
  total: number;
};

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
  const total = rawCartTotal(cart, activePriceType);
  // опт — заказ от 5 000 ₽, крупный опт — от 50 000 ₽ (цены сразу по типу клиента)
  const minOrder = minOrderFor(customer);
  const remainingToMin = amountUntilMinOrder(cart, customer);

  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderResult, setOrderResult] = useState<{ orderId: number; bonusesApplied: number; bonusesCollected: number } | null>(null);

  // Promo code + MAXMA bonuses: calculated by /api/checkout/calc (one MAXMA calculation),
  // re-calculated (debounced) when the cart, the promo code or the bonus toggle changes
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [bonuses, setBonuses] = useState<CalcBonuses | null>(null);
  const [spendBonuses, setSpendBonuses] = useState(false);
  // false after the server said the customer has no linked card: no calc without a promo code
  const [hasCard, setHasCard] = useState(true);
  const calcReq = useRef(0);
  const cartSignature = cart.map((i) => `${i.cartKey || i.id}:${i.quantity}`).join(",");
  const bonusesApplied = spendBonuses && bonuses?.canSpend ? bonuses.applied : 0;
  const promoTotal = Math.max(0, total - (promo?.discount ?? 0) - bonusesApplied);

  async function postCalc(code: string | null, applyBonuses: number) {
    const res = await fetch("/api/checkout/calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: useCartStore.getState().cart.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          variantName: item.variantName ?? null,
        })),
        ...(code ? { promocode: code } : {}),
        applyBonuses,
      }),
    });
    const data: CalcResponse | null = await res.json().catch(() => null);
    return { ok: res.ok && !!data && !data.error, data };
  }

  /**
   * code — the promo code to apply (null = none); recheck — the code was applied before;
   * spend — spend bonuses (MAXMA's maximum).
   */
  async function runCalc(code: string | null, opts: { recheck?: boolean; spend?: boolean } = {}) {
    const req = ++calcReq.current;
    const spend = opts.spend ?? spendBonuses;
    if (code) setPromoLoading(true);
    if (code && !opts.recheck) setPromoError("");
    let r: Awaited<ReturnType<typeof postCalc>> | null = null;
    try {
      r = await postCalc(code, spend ? bonuses?.maxToApply ?? 0 : 0);
      // Spending on and MAXMA now allows a different maximum: ask once more with it
      const b = r.data?.bonuses;
      if (r.ok && spend && b?.canSpend && b.maxToApply > 0 && b.applied < b.maxToApply && req === calcReq.current) {
        r = await postCalc(code, b.maxToApply);
      }
    } catch {
      r = null; // network error
    }
    if (req !== calcReq.current) return; // a newer calculation is running
    setPromoLoading(false);
    const data = r?.data ?? null;
    if (!r?.ok || !data) {
      const message = data?.error || "Не удалось рассчитать скидку";
      if (code) {
        setPromo(null);
        setPromoError(opts.recheck ? `Промокод ${code} больше не применяется: ${message}` : message);
      }
      return;
    }
    setBonuses(data.bonuses ?? null);
    setHasCard(Boolean(data.bonuses));
    if (!data.bonuses?.canSpend) setSpendBonuses(false);
    if (code) {
      if (data.promo) {
        setPromo({ code: data.promo.code, discount: data.promo.discount });
        setPromoError("");
      } else {
        const message = data.promoError || "Промокод не применён";
        setPromo(null);
        setPromoError(opts.recheck ? `Промокод ${code} больше не применяется: ${message}` : message);
      }
    }
  }

  function checkPromo(code: string) {
    runCalc(code);
  }

  function removePromo() {
    calcReq.current++;
    setPromo(null);
    setPromoInput("");
    setPromoError("");
    setPromoLoading(false);
    if (hasCard && cart.length > 0) runCalc(null);
  }

  function toggleBonuses(on: boolean) {
    setSpendBonuses(on);
    runCalc(promo?.code ?? null, { recheck: true, spend: on });
  }

  // Cart changed (or the drawer opened) → recalculate promo code and bonuses (debounced)
  const appliedCode = promo?.code ?? null;
  const loggedIn = Boolean(customer);
  useEffect(() => {
    if (!loggedIn || !isCartOpen) return;
    if (cart.length === 0) {
      calcReq.current++;
      const t = setTimeout(() => {
        setPromo(null);
        setPromoError("");
        setBonuses(null);
        setSpendBonuses(false);
      }, 0);
      return () => clearTimeout(t);
    }
    if (!appliedCode && !hasCard) return;
    const t = setTimeout(() => runCalc(appliedCode, { recheck: true }), 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature, loggedIn, isCartOpen]);

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
        ...(bonusesApplied > 0 ? { applyBonuses: bonusesApplied } : {}),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Ошибка оформления заказа");
      // The server rejected the promo code / bonuses — drop them so the order can go without
      const err = String(data.error ?? "");
      if (promo && res.status === 400 && err.startsWith("Промокод:")) removePromo();
      if (bonusesApplied > 0 && (err.startsWith("Бонусы:") || err.startsWith("Списание бонусов"))) toggleBonuses(false);
      return;
    }

    clearCart();
    setComment("");
    calcReq.current++;
    setPromo(null);
    setPromoInput("");
    setPromoError("");
    setPromoLoading(false);
    setBonuses(null);
    setSpendBonuses(false);
    setOrderResult({
      orderId: data.orderId,
      bonusesApplied: Number(data.bonusesApplied) || 0,
      bonusesCollected: Number(data.bonusesCollected) || 0,
    });
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
            {(orderResult.bonusesApplied > 0 || orderResult.bonusesCollected > 0) && (
              <p className="order-confirm-bonuses">
                {orderResult.bonusesApplied > 0 && <>Списано бонусов: {orderResult.bonusesApplied.toLocaleString("ru-RU")}. </>}
                {orderResult.bonusesCollected > 0 && (
                  <>Будет начислено {orderResult.bonusesCollected.toLocaleString("ru-RU")} бонусов после выполнения заказа.</>
                )}
              </p>
            )}
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

                  {/* === Опт / крупный опт: минимальная сумма заказа === */}
                  {customer && minOrder > 0 && remainingToMin > 0 && (
                    <div className="cart-progress-banner">
                      <div className="cart-progress-text">
                        <span>До минимальной суммы заказа осталось</span>
                        <strong>{remainingToMin.toLocaleString("ru-RU")} ₽</strong>
                      </div>
                      <div className="cart-progress-bar">
                        <div
                          className="cart-progress-fill"
                          style={{ width: `${Math.min(100, (total / minOrder) * 100)}%` }}
                        />
                      </div>
                      <div className="cart-progress-hint">
                        Заказ по ценам <strong>«{priceTypeLabel(base)}»</strong> — от {minOrder.toLocaleString("ru-RU")} ₽
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

                  {/* MAXMA bonuses: spending — retail customers with a linked card; accrual — any linked card */}
                  {customer && bonuses && SITE_RETAIL_ENABLED && (
                    <div className="cart-bonuses">
                      {bonuses.canSpend && (
                        <label className={`cart-bonuses-toggle ${bonuses.maxToApply <= 0 ? "cart-bonuses-toggle--off" : ""}`}>
                          <input
                            type="checkbox"
                            checked={spendBonuses}
                            disabled={bonuses.maxToApply <= 0 && !spendBonuses}
                            onChange={(e) => toggleBonuses(e.target.checked)}
                          />
                          <span>
                            <b>Списать бонусы</b>
                            <span className="cart-bonuses-hint">
                              {bonuses.balance != null ? <>Доступно {bonuses.balance.toLocaleString("ru-RU")} бонусов, </> : null}
                              {bonuses.maxToApply > 0
                                ? <>можно списать до {bonuses.maxToApply.toLocaleString("ru-RU")}</>
                                : <>на этот заказ списать нельзя</>}
                            </span>
                          </span>
                        </label>
                      )}
                      {bonusesApplied > 0 && (
                        <div className="cart-bonuses-line">
                          <span>Списано бонусов</span>
                          <b>−{bonusesApplied.toLocaleString("ru-RU")} ₽</b>
                        </div>
                      )}
                      {bonuses.collected > 0 && (
                        <div className="cart-bonuses-accrual">Будет начислено {bonuses.collected.toLocaleString("ru-RU")} бонусов</div>
                      )}
                    </div>
                  )}

                  {customer ? (
                    <button
                      onClick={checkout}
                      disabled={loading || cart.length === 0 || remainingToMin > 0}
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
