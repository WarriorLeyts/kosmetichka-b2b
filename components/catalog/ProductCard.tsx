"use client";

import { Bell, Heart, ShoppingCart, GitCompareArrows } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { useWishlistStore } from "@/store/wishlistStore";
import { useCompareStore } from "@/store/compareStore";
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
  /** Called when this card needs the variant picker — parent renders a single shared modal */
  onOpenPicker: (product: any, variants: Variant[]) => void;
};

export function ProductCard({ product, addToCart, onOpenPicker }: Props) {
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
  const productCartKey = String(product.id);
  const cartQty = useCartStore(
    (s) => s.cart
      .filter((i) => i.cartKey === productCartKey || i.cartKey.startsWith(`${productCartKey}_v`))
      .reduce((sum, i) => sum + i.quantity, 0)
  );
  const hasVariantsInCart = useCartStore(
    (s) => s.cart.some((i) => i.cartKey.startsWith(`${productCartKey}_v`))
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

  // Compare store
  const addToCompare = useCompareStore((s) => s.add);
  const removeFromCompare = useCompareStore((s) => s.remove);
  const isInCompare = useCompareStore((s) => s.has(product.id));
  const canAddToCompare = useCompareStore((s) => s.canAdd());

  // Animation states
  const [favAnim, setFavAnim] = useState(false);
  const [bellAnim, setBellAnim] = useState(false);

  // Variant cache + loading (fetched once, then re-used)
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [navigating, setNavigating] = useState(false);

  function handleCardClick() {
    setNavigating(true);
    try { sessionStorage.setItem("catalog_scroll", String(window.scrollY)); } catch {}
    router.push(`/product/${product.id}`);
  }

  function handleMouseEnter() {
    router.prefetch(`/product/${product.id}`);
  }

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
            onOpenPicker(product, list);
            return;
          }
        }
      } else if (variants.length > 0) {
        onOpenPicker(product, variants);
        return;
      }
      addToCart(product);
    } finally {
      setLoadingVariants(false);
    }
  }

  return (
    <article
      className="product-card cursor-pointer"
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      style={{ position: "relative" }}
    >
      {/* Loading overlay — shown immediately on click while page loads */}
      {navigating && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          borderRadius: "inherit",
          background: "rgba(255,255,255,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(1px)",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "3px solid #e2e8f0",
            borderTopColor: "#ec4899",
            animation: "spin 0.7s linear infinite",
          }} />
        </div>
      )}
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
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWishlist(product.id);
                  setBellAnim(true);
                }}
                className={`wishlist-bell flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition ${
                  isInWishlist
                    ? "border-indigo-200 bg-indigo-50 text-indigo-500"
                    : "border-slate-200 bg-white text-slate-400 hover:bg-indigo-50 hover:text-indigo-500"
                }`}
              >
                <Bell
                  size={15}
                  fill={isInWishlist ? "currentColor" : "none"}
                  className={bellAnim ? "bell-ring" : ""}
                  onAnimationEnd={() => setBellAnim(false)}
                />
              </button>
            )}
          </div>
        ) : cartQty > 0 ? (
          <div className="flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {hasVariantsInCart ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); if (variants) onOpenPicker(product, variants); }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 h-9 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <span className="text-blue-600">{cartQty}</span> шт.
                </button>
                <button onClick={openCart} className="cart-button flex-1">В корзине</button>
              </>
            ) : (
              <>
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button
                    onClick={() => decreaseQuantity(productCartKey)}
                    className="flex h-9 w-9 items-center justify-center text-lg font-bold text-slate-600 hover:bg-slate-100 active:scale-90"
                  >
                    −
                  </button>
                  <span className="min-w-[28px] text-center text-sm font-black text-slate-800">
                    {cartQty}
                  </span>
                  <button
                    onClick={() => increaseQuantity(productCartKey)}
                    className="flex h-9 w-9 items-center justify-center text-lg font-bold text-slate-600 hover:bg-slate-100 active:scale-90"
                  >
                    +
                  </button>
                </div>
                <button onClick={openCart} className="cart-button flex-1">В корзине</button>
              </>
            )}
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
            setFavAnim(true);
            if (customer) toggleWishlist(product.id);
          }}
        >
          <Heart
            size={16}
            fill={isFavorite ? "currentColor" : "none"}
            className={favAnim ? "fav-pop" : ""}
            onAnimationEnd={() => setFavAnim(false)}
          />
        </button>

        {/* Compare button */}
        <button
          title={
            isInCompare
              ? "Убрать из сравнения"
              : canAddToCompare
              ? "Добавить в сравнение"
              : "В сравнении уже 3 товара"
          }
          className={`favorite-button ${isInCompare ? "active" : ""}`}
          style={isInCompare ? { color: "#6366f1", borderColor: "#c7d2fe", background: "#eef2ff" } : {}}
          disabled={!isInCompare && !canAddToCompare}
          onClick={(e) => {
            e.stopPropagation();
            if (isInCompare) {
              removeFromCompare(product.id);
            } else if (canAddToCompare) {
              addToCompare({
                id: product.id,
                name: product.name,
                imagePath: imagePath,
                description: product.description ?? null,
                brandName: product.brand?.name ?? null,
                categoryName: product.category?.name ?? null,
                retailPrice: product.retailPrice ?? null,
                discountPrice: product.discountPrice ?? null,
                wholesalePrice: product.wholesalePrice ?? null,
                bigWholesalePrice: product.bigWholesalePrice ?? null,
                stock: product.stock ?? null,
                article: product.article ?? null,
                barcode: product.barcode ?? null,
                minOrderQty: product.minOrderQty ?? 1,
              });
            }
          }}
        >
          <GitCompareArrows size={15} />
        </button>
      </div>
    </article>
  );
}
