"use client";

import { X, ShoppingCart, ExternalLink, Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { SafeImage } from "./SafeImage";
import { resolveImageUrl } from "@/lib/image";
import { getStockLabel } from "@/lib/utils";
import { effectivePriceType, priceFor } from "@/lib/pricing";

type Props = {
  product: any | null;
  onClose: () => void;
};

export function ProductQuickView({ product, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [fullProduct, setFullProduct] = useState<any | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  // Open/close animation + fetch full data
  useEffect(() => {
    if (product) {
      setFullProduct(null);
      setVisible(true);
      setClosing(false);
      // Fetch description + characteristics in background
      setLoadingFull(true);
      fetch(`/api/products/${product.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data) setFullProduct(data); })
        .catch(() => {})
        .finally(() => setLoadingFull(false));
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 270);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const cart = useCartStore((s) => s.cart);
  const addToCart = useCartStore((s) => s.addToCart);
  const increaseQuantity = useCartStore((s) => s.increaseQuantity);
  const decreaseQuantity = useCartStore((s) => s.decreaseQuantity);
  const openCart = useCartStore((s) => s.openCart);
  const customer = useAuthStore((s) => s.customer);
  const toggleFavorite = useFavoriteStore((s) => s.toggleFavorite);
  const isFavorite = useFavoriteStore((s) =>
    product ? s.favorites.some((f) => f.id === product.id) : false
  );

  if (!visible || !product) return null;

  const p = fullProduct ?? product;
  const cartKey = String(product.id);
  const cartQty = cart.find((i) => i.cartKey === cartKey)?.quantity ?? 0;
  const stock = getStockLabel(p.stock);
  const isOutOfStock = (p.stock ?? 0) <= 0;
  const activePriceType = effectivePriceType(cart, customer);
  const price = priceFor(p, activePriceType);
  const imagePath = p.images?.[0]?.path
    ? resolveImageUrl(p.images[0].path)
    : null;

  function handleClose() {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, 270);
  }

  return (
    <div
      className={`qv-overlay ${closing ? "qv-overlay--closing" : "qv-overlay--open"}`}
      onClick={handleClose}
    >
      <aside
        className={`qv-drawer ${closing ? "qv-drawer--closing" : "qv-drawer--open"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="qv-header">
          <h2 className="qv-title">{p.name}</h2>
          <button onClick={handleClose} className="qv-close" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="qv-body">
          {/* Image */}
          <div className="qv-image">
            <SafeImage src={imagePath} alt={p.name} placeholderIconSize={36} />
          </div>

          {/* Stock + price */}
          <div className="qv-price-block">
            <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
            <div className="qv-price">{price.toLocaleString("ru-RU")} ₽</div>
            <div className="qv-meta-chips">
              {p.category?.name && (
                <span className="qv-chip qv-chip--pink">{p.category.name}</span>
              )}
              {p.brand?.name && (
                <span className="qv-chip qv-chip--blue">{p.brand.name}</span>
              )}
            </div>
          </div>

          {/* Cart controls */}
          <div className="qv-actions">
            {isOutOfStock ? (
              <button
                disabled
                className="qv-cart-btn"
                style={{ opacity: 0.45, cursor: "not-allowed" }}
              >
                <ShoppingCart size={15} />
                Нет в наличии
              </button>
            ) : cartQty > 0 ? (
              <div className="qv-stepper-row">
                <div className="qv-stepper">
                  <button onClick={() => decreaseQuantity(cartKey)}>−</button>
                  <span>{cartQty}</span>
                  <button onClick={() => increaseQuantity(cartKey)}>+</button>
                </div>
                <button
                  onClick={openCart}
                  className="qv-cart-btn"
                  style={{ color: "#fff" }}
                >
                  В корзине
                </button>
              </div>
            ) : (
              <button
                onClick={() => addToCart(p)}
                className="qv-cart-btn"
                style={{ color: "#fff" }}
              >
                <ShoppingCart size={15} />
                В корзину
              </button>
            )}

            <button
              onClick={() => toggleFavorite(p)}
              className={`qv-fav-btn ${isFavorite ? "active" : ""}`}
              title={isFavorite ? "Убрать из избранного" : "В избранное"}
            >
              <Heart
                size={16}
                stroke="#ec4899"
                fill={isFavorite ? "#ec4899" : "none"}
              />
            </button>
          </div>

          {/* Quick characteristics */}
          {(p.barcode || p.article) && (
            <div className="qv-info-grid">
              {p.barcode && (
                <div className="qv-info-item">
                  <span>Штрихкод</span>
                  <b>{p.barcode}</b>
                </div>
              )}
              {p.article && (
                <div className="qv-info-item">
                  <span>Артикул</span>
                  <b>{p.article}</b>
                </div>
              )}
            </div>
          )}

          {/* Description – shown once loaded */}
          {loadingFull && !fullProduct && (
            <div className="qv-loading">
              <div className="h-4 w-full animate-pulse rounded bg-slate-100 mb-2" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100 mb-2" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          )}
          {fullProduct?.description && (
            <div className="qv-description">
              <div className="qv-description-title">О товаре</div>
              <p className="qv-description-text">{fullProduct.description}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="qv-footer">
          <Link
            href={`/product/${product.id}`}
            className="qv-full-link"
            onClick={handleClose}
          >
            <ExternalLink size={14} />
            Полная страница товара
          </Link>
        </div>
      </aside>
    </div>
  );
}
