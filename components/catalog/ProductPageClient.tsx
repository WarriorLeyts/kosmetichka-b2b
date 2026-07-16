"use client";

import Link from "next/link";
import { Heart, ShoppingCart, Package, Tag } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { ProductGallery } from "./ProductGallery";
import { ProductCard } from "./ProductCard";
import { TopBar } from "./TopBar";
import { getStockLabel } from "@/lib/utils";
import { resolveCustomerPriceType, priceFor, priceTypeLabel } from "@/lib/pricing";
import { useState } from "react";

type Variant = { id: number; imageUrl: string; name: string };

export function ProductPageClient({
  product,
  relatedProducts,
}: {
  product: any;
  relatedProducts: any[];
}) {
  const addToCart = useCartStore((state) => state.addToCart);
  const addToCartWithVariant = useCartStore((state) => state.addToCartWithVariant);
  const toggleFavorite = useFavoriteStore((state) => state.toggleFavorite);
  const customer = useAuthStore((state) => state.customer);

  const isFavorite = useFavoriteStore((state) =>
    state.favorites.some((item) => item.id === product.id)
  );

  const stock = getStockLabel(product.stock);
  const priceType = resolveCustomerPriceType(customer);
  const mainPrice = priceFor(product, priceType);
  const mainLabel = priceTypeLabel(priceType);

  // Variant picker state
  const [search, setSearch] = useState("");
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [variantQtys, setVariantQtys] = useState<Record<number, number>>({});

  async function handleAddToCart() {
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
      return { ...prev, [variantId]: Math.max(0, cur + delta) };
    });
  }

  function submitVariants() {
    (variants ?? []).forEach((v) => {
      const qty = variantQtys[v.id] ?? 0;
      for (let i = 0; i < qty; i++) {
        addToCartWithVariant(product, v);
      }
    });
    setShowPicker(false);
    setVariantQtys({});
  }

  const totalSelected = Object.values(variantQtys).reduce((s, n) => s + n, 0);

  return (
    <main className="min-h-screen bg-slate-50">
      <TopBar search={search} setSearch={setSearch} />
      <div className="mx-auto max-w-[1400px] px-3 py-4 md:px-6 md:py-6">

        {/* Breadcrumb */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link href="/" className="hover:text-pink-500">Главная</Link>
          <span>/</span>
          <Link href="/catalog" className="hover:text-pink-500">Каталог</Link>
          {product.brand?.name && (
            <>
              <span>/</span>
              <Link href="/catalog" className="hover:text-pink-500">{product.brand.name}</Link>
            </>
          )}
          <span>/</span>
          <span className="line-clamp-1 text-slate-700 font-medium">{product.name}</span>
        </div>

        {/* ── Main product section ── */}
        {/* Layout: [gallery-with-thumbs] | [info panel] */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">

          {/* LEFT — Gallery (thumbs + main image, WB-style handled inside ProductGallery) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <ProductGallery images={product.images} productName={product.name} />
          </div>

          {/* RIGHT — Info panel */}
          <div className="flex flex-col gap-4">

            {/* Brand + category tags */}
            <div className="flex flex-wrap gap-2">
              {product.brand?.name && (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                  {product.brand.name}
                </span>
              )}
              {product.category?.name && (
                <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-500">
                  {product.category.name}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-xl font-black leading-snug text-slate-900 md:text-2xl">
              {product.name}
            </h1>

            {/* Meta: barcode, article, stock */}
            <div className="space-y-1.5 text-sm text-slate-500">
              {product.barcode && (
                <p>
                  <span className="font-medium text-slate-400">Штрихкод:</span>{" "}
                  <span className="font-semibold text-slate-700">{product.barcode}</span>
                </p>
              )}
              {product.article && (
                <p>
                  <span className="font-medium text-slate-400">Артикул:</span>{" "}
                  <span className="font-semibold text-slate-700">{product.article}</span>
                </p>
              )}
              <p className="flex items-center gap-2">
                <span className="font-medium text-slate-400">Наличие:</span>
                <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
              </p>
            </div>

            {/* Price block */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {customer && product.retailPrice != null && (
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Розница:</span>
                  <span className="font-semibold text-slate-600">{product.retailPrice} ₽</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-500">
                  {customer ? mainLabel : "Цена"}:
                </span>
                <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-3xl font-black text-transparent">
                  {mainPrice} ₽
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={loadingVariants}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-70 md:h-14 md:text-base"
              >
                <ShoppingCart size={18} />
                {loadingVariants ? "..." : "В корзину"}
              </button>
              <button
                onClick={() => toggleFavorite(product)}
                title={isFavorite ? "Убрать из избранного" : "В избранное"}
                className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border-2 transition md:h-14 md:w-14 ${
                  isFavorite
                    ? "border-pink-300 bg-pink-50 text-pink-500"
                    : "border-slate-200 bg-white text-slate-400 hover:border-pink-300 hover:text-pink-500"
                }`}
              >
                <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </div>

            {/* Info tiles: brand + availability */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                <Tag size={16} className="mt-0.5 flex-shrink-0 text-blue-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-400">Бренд</div>
                  <div className="mt-0.5 text-sm font-bold text-slate-800">
                    {product.brand?.name || "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                <Package size={16} className="mt-0.5 flex-shrink-0 text-pink-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-400">Наличие</div>
                  <div className="mt-0.5 text-sm font-bold">
                    <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-black text-slate-800 md:text-base">
                Описание товара
              </h3>
              <p className="text-sm leading-6 text-slate-600">
                {product.description || "Описание для данного товара пока не заполнено."}
              </p>
            </div>

          </div>
        </div>

        {/* ── Related products ── */}
        {relatedProducts.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-xl font-black text-transparent md:text-2xl">
              Похожие товары
            </h2>
            <div className="product-grid grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {relatedProducts.map((item) => (
                <ProductCard key={item.id} product={item} addToCart={addToCart} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Variant picker modal ── */}
      {showPicker && variants && variants.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 line-clamp-2 text-base font-bold text-slate-800">
              {product.name}
            </h3>
            <p className="mb-4 text-sm text-slate-500">Выберите варианты и количество</p>

            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
              {variants.map((v) => {
                const qty = variantQtys[v.id] ?? 0;
                return (
                  <div key={v.id} className="flex items-center gap-3">
                    {v.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.imageUrl}
                        alt={v.name}
                        className="h-14 w-14 flex-shrink-0 rounded-xl border object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border bg-slate-100 text-xl">
                        🧴
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium text-slate-800">{v.name}</span>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        onClick={() => changeQty(v.id, -1)}
                        disabled={qty === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{qty}</span>
                      <button
                        onClick={() => changeQty(v.id, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 hover:bg-slate-50"
                      >
                        +
                      </button>
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
    </main>
  );
}
