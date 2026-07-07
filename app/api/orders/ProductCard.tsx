"use client";

import { Heart, ShoppingCart } from "lucide-react";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SafeImage } from "./SafeImage";
import { getStockLabel } from "@/lib/utils";
import { resolveCustomerPriceType, priceFor, priceTypeLabel } from "@/lib/pricing";
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
  const router = useRouter();
  const customer = useAuthStore((state) => state.customer);

  const stock = getStockLabel(product.stock);
  const priceType = resolveCustomerPriceType(customer);
  const mainPrice = priceFor(product, priceType);
  const mainLabel = priceTypeLabel(priceType);

  // Variant picker state
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [variantQtys, setVariantQtys] = useState<Record<number, number>>({});

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
        </div>

        {customer && (
          <div className="price-row">
            <span>Розница:</span>
            <b>{product.retailPrice ?? 0} ₽</b>
          </div>
        )}

        <div className="price-row">
          <span>{customer ? mainLabel + ":" : "Цена:"}</span>
          <b className={customer ? "accent-price" : ""}>{mainPrice} ₽</b>
        </div>

        <div className="card-actions">
          <button
            className="cart-button"
            disabled={loadingVariants}
            onClick={handleAddToCart}
          >
            <ShoppingCart size={15} />
            {loadingVariants ? "…" : "В корзину"}
          </button>

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
                    {v.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.imageUrl}
                        alt={v.name}
                        className="h-14 w-14 rounded-xl object-cover border flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-xl border bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">🧴</div>
                    )}
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
