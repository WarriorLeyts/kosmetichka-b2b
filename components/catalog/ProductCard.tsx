"use client";

import { Bell, Heart, ShoppingCart } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { useWishlistStore } from "@/store/wishlistStore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SafeImage } from "./SafeImage";
import { getStockLabel } from "@/lib/utils";
import {
  resolveCustomerPriceType,
  effectivePriceType,
  priceFor,
} from "@/lib/pricing";
import { resolveImageUrl } from "@/lib/image";
import { useCartStore } from "@/store/cartStore";
import { useState } from "react";

type Variant = { id: number; imageUrl: string; name: string };

type Props = {
  product: any;
  addToCart: (product: any) => void;
};

export function ProductCard({ product, addToCart }: Props) {
  const imagePath = product.images?.[0]?.path
    ? resolveImageUrl(product.images[0].path)
    : null;

  const toggleFavorite = useFavoriteStore((state) => state.toggleFavorite);
  const isFavorite = useFavoriteStore((state) =>
    state.favorites.some((item) => item.id === product.id)
  );
  const addToCartWithVariant = useCartStore((s) => s.addToCartWithVariant);
  const increaseQuantity = useCartStore((s) => s.increaseQuantity);
  const decreaseQuantity = useCartStore((s) => s.decreaseQuantity);
  const openCart = useCartStore((s) => s.openCart);
  const cartQty = useCartStore(
    (s) => s.cart.find((i) => i.cartKey === String(product.id))?.quantity ?? 0
  );
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);
  const isInWishlist = useWishlistStore((s) => s.isInWishlist(product.id));
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  const cartItems = useCartStore((s) => s.cart);
  const stock = getStockLabel(product.stock);
  const isOutOfStock = (product.stock ?? 0) <= 0;
  const base = resolveCustomerPriceType(customer);
  const activePriceType = effectivePriceType(cartItems, customer);
  const mainPrice = priceFor(product, activePriceType);

  // Variant picker state
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [variantQtys, setVariantQtys] = useState<Record<number, number>>({});
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  async function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation();
    setLoadingVariants(true);
    try {
      if (variants === null) {
        const res = await fetch(`/api/products/${product.id}/variants`);
        if (res.ok) {
          const data = await res.json();
          const list: Variant[] = data.variants ?? [];
          setVariants(list);
          if (list.length > 0) {
            setVariantQtys({});
            setShowPicker(true);
            return;
          }
        }
      } else if (variants.length > 0) {
        setVariantQtys({});
        setShowPicker(true);
        return;
      }
      addToCart(product);
    } finally {
      setLoadingVariants(false);
    }
  }

  function changeQty(variantId: number, delta: number) {
    setVariantQtys((prev) => {
      const cur = prev[variantId] ?? 0;
      const next = Math.max(0, cur + delta);
      return { ...prev, [variantId]: next };
    });
  }

  function submitVariants() {
    const list = variants ?? [];
    list.forEach((v) => {
      const qty = variantQtys[v.id] ?? 0;
      if (qty > 0) {
        for (let i = 0; i < qty; i++) {
          addToCartWithVariant(product, v);
        }
      }
    });
    setShowPicker(false);
    setVariantQtys({});
  }

  const totalSelected = Object.values(variantQtys).reduce((s, n) => s + n, 0);

  return (
    <>
      <article
        className="product-card cursor-pointer"
        onClick={() => router.push(`/product/${product.id}`)}
      >
        <div className="product-image-box">
          <SafeImage src={imagePath} alt={product.name} placeholderIconSize={18} />
        </div>

        <Link href={`/product/${product.id}`} onClick={(e) => e.stopPropagation()}>
          <h2>{product.name}</h2>
        </Link>

        <div className="product-meta">
          <span className="truncate">
            {product.category?.name || product.barcode || "—"}
          </span>
          <strong className={stock.className}>{stock.text}</strong>
          {((product as any).minOrderQty ?? 1) > 1 && (
            <span className="text-xs font-semibold text-indigo-500">
              Мин. {(product as any).minOrderQty} шт.
            </span>
          )}
        </div>

        {/* Гость или Скидка: Розница + Скидка */}
        {(base === "guest" || base === "discount") && (
          <>
            <div className="price-row">
              <span>Розница:</span>
              <b>{Number(product.retailPrice ?? 0).toLocaleString("ru-RU")} ₽</b>
            </div>
            {product.discountPrice != null &&
              Number(product.discountPrice) > 0 &&
              Number(product.discountPrice) !== Number(product.retailPrice) && (
              <div className="price-row price-row-active">
                <span>Скидка:</span>
                <b>{Number(product.discountPrice).toLocaleString("ru-RU")} ₽</b>
              </div>
            )}
          </>
        )}

        {/* Розница: только розничная цена */}
        {base === "retail" && (
          <div className="price-row price-row-active">
            <span>Розница:</span>
            <b>{Number(product.retailPrice ?? 0).toLocaleString("ru-RU")} ₽</b>
          </div>
        )}

        {/* Опт: Скидка + Опт + Крупный опт с подсветкой активного */}
        {base === "wholesale" && (
          <>
            <div className={`price-row ${activePriceType === "discount" ? "price-row-active" : "price-row-muted"}`}>
              <span>Скидка:</span>
              <b>{Number(product.discountPrice ?? product.retailPrice ?? 0).toLocaleString("ru-RU")} ₽</b>
            </div>
            <div className={`price-row ${activePriceType === "wholesale" ? "price-row-active" : "price-row-muted"}`}>
              <span>Опт:</span>
              <b>{Number(product.wholesalePrice ?? 0).toLocaleString("ru-RU")} ₽</b>
            </div>
            {product.bigWholesalePrice != null &&
              Number(product.bigWholesalePrice) > 0 &&
              Number(product.bigWholesalePrice) !== Number(product.wholesalePrice) && (
              <div className={`price-row ${activePriceType === "big_wholesale" ? "price-row-active" : "price-row-muted"}`}>
                <span>Кр. опт:</span>
                <b>{Number(product.bigWholesalePrice).toLocaleString("ru-RU")} ₽</b>
              </div>
            )}
          </>
        )}

        {/* Крупный опт: Опт (серый) + Крупный опт (активный) */}
        {base === "big_wholesale" && (
          <>
            <div className="price-row price-row-muted">
              <span>Опт:</span>
              <b>{Number(product.wholesalePrice ?? 0).toLocaleString("ru-RU")} ₽</b>
            </div>
            <div className="price-row price-row-active">
              <span>Кр. опт:</span>
              <b>{Number(product.bigWholesalePrice ?? product.wholesalePrice ?? 0).toLocaleString("ru-RU")} ₽</b>
            </div>
          </>
        )}

        <div className="card-actions">
          {isOutOfStock ? (
            <div className="flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button className="cart-button flex-1" disabled style={{ opacity: 0.45, cursor: "not-allowed" }}>
                <ShoppingCart size={15} />
                Нет в наличии
              </button>
              {customer && (
                <button
                  title={isInWishlist ? "Убрать из листа ожидания" : "Уведомить о наличии"}
                  onClick={(e) => { e.stopPropagation(); toggleWishlist(product.id); }}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition ${
                    isInWishlist
                      ? "border-indigo-200 bg-indigo-50 text-indigo-500"
                      : "border-slate-200 bg-white text-slate-400 hover:bg-indigo-50 hover:text-indigo-500"
                  }`}
                >
                  <Bell size={15} fill={isInWishlist ? "currentColor" : "none"} />
                </button>
              )}
            </div>
          ) : cartQty > 0 ? (
            <div className="flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  onClick={() => decreaseQuantity(String(product.id))}
                  className="flex h-9 w-9 items-center justify-center text-lg font-bold text-slate-600 hover:bg-slate-100 active:scale-90"
                >
                  −
                </button>
                <span className="min-w-[28px] text-center text-sm font-black text-slate-800">
                  {cartQty}
                </span>
                <button
                  onClick={() => increaseQuantity(String(product.id))}
                  className="flex h-9 w-9 items-center justify-center text-lg font-bold text-slate-600 hover:bg-slate-100 active:scale-90"
                >
                  +
                </button>
              </div>
              <button
                onClick={openCart}
                className="cart-button flex-1"
              >
                В корзине
              </button>
            </div>
          ) : (
            <button
              className="cart-button"
              disabled={loadingVariants}
              onClick={handleAddToCart}
            >
              <ShoppingCart size={15} />
              {loadingVariants ? "…" : "В корзину"}
            </button>
          )}

          <button
            className={`favorite-button ${isFavorite ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(product);
            }}
          >
            <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>
      </article>

      {/* Image zoom lightbox */}
      {zoomedImg && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomedImg(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomedImg}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomedImg(null)}
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 text-xl font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Variant picker modal */}
      {showPicker && variants && variants.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-base font-bold text-slate-800 line-clamp-2">
              {product.name}
            </h3>
            <p className="mb-4 text-sm text-slate-500">Выберите варианты и количество</p>

            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
              {variants.map((v) => {
                const qty = variantQtys[v.id] ?? 0;
                return (
                  <div key={v.id} className="flex items-center gap-3">
                    <div
                      className="h-14 w-14 rounded-xl border bg-slate-100 flex-shrink-0 overflow-hidden cursor-zoom-in"
                      onClick={(e) => { if (v.imageUrl) { e.stopPropagation(); setZoomedImg(v.imageUrl); } }}
                    >
                      {v.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.imageUrl}
                          alt={v.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover hover:opacity-80 transition-opacity"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xl">🧴</span>
                      )}
                    </div>
                    <span className="flex-1 text-sm font-medium text-slate-800">{v.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => changeQty(v.id, -1)}
                        disabled={qty === 0}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-slate-50"
                      >−</button>
                      <span className="w-6 text-center text-sm font-bold">{qty}</span>
                      <button
                        onClick={() => changeQty(v.id, 1)}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-600 hover:bg-slate-50"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowPicker(false)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                onClick={submitVariants}
                disabled={totalSelected === 0}
                className="flex-1 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                В корзину {totalSelected > 0 ? `(${totalSelected})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
