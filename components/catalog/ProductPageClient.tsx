"use client";

import Link from "next/link";
import { resolveImageUrl } from "@/lib/image";
import { ArrowLeft, Heart, ShoppingCart } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { ProductGallery } from "./ProductGallery";
import { ProductCard } from "./ProductCard";
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
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      <Link
        href="/catalog"
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-pink-500"
      >
        <ArrowLeft size={18} />
        Назад в каталог
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
        <Link href="/" className="hover:text-pink-500">Главная</Link>
        <span>/</span>
        <Link href="/catalog" className="hover:text-pink-500">Каталог</Link>
        {product.brand?.name && (
          <>
            <span>/</span>
            <span className="text-slate-700">{product.brand.name}</span>
          </>
        )}
        <span>/</span>
        <span className="line-clamp-1 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent">
          {product.name}
        </span>
      </div>
      <section className="grid grid-cols-1 gap-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:gap-10 md:rounded-[32px] md:p-8 xl:grid-cols-[520px_1fr]">
        <ProductGallery images={product.images} productName={product.name} />

        <div>
          <div className="mb-3 flex flex-wrap gap-1.5 md:mb-4 md:gap-2">
            {product.category?.name && (
              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-500 md:px-4 md:py-2 md:text-sm">
                {product.category.name}
              </span>
            )}
            {product.brand?.name && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 md:px-4 md:py-2 md:text-sm">
                {product.brand.name}
              </span>
            )}
          </div>

          <h1 className="mb-3 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-lg font-black leading-tight text-transparent md:text-4xl">
            {product.name}
          </h1>

          <div className="mb-4 space-y-1.5 text-xs font-semibold text-slate-600 md:space-y-3 md:text-sm">
            <p>Штрихкод: {product.barcode || "—"}</p>
            <p>Артикул: {product.article || "—"}</p>
            <p>
              Наличие:{" "}
              <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
            </p>
          </div>

          <div className="mb-4 rounded-[16px] bg-slate-50 p-3 md:mb-8 md:rounded-[22px] md:p-5">
            {customer && (
              <div className="mb-2 flex justify-between text-sm md:mb-3 md:text-lg">
                <span className="text-slate-500">Розница:</span>
                <b>{product.retailPrice ?? 0} ₽</b>
              </div>
            )}
            <div className="flex justify-between text-base md:text-2xl">
              <span className="font-bold text-slate-500">
                {customer ? mainLabel : "Цена"}:
              </span>
              <b className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent">
                {mainPrice} ₽
              </b>
            </div>
          </div>

          <div className="flex gap-2 md:gap-3">
            <button
              onClick={handleAddToCart}
              disabled={loadingVariants}
              className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-lg md:h-14 md:rounded-2xl md:text-base disabled:opacity-70"
            >
              <ShoppingCart size={16} />
              {loadingVariants ? "..." : "В корзину"}
            </button>

            <button
              onClick={() => toggleFavorite(product)}
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border md:h-14 md:w-14 md:rounded-2xl ${
                isFavorite
                  ? "border-pink-200 bg-pink-50 text-pink-500"
                  : "border-slate-200 bg-white text-pink-500"
              }`}
            >
              <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 md:mb-8 md:gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 md:rounded-2xl md:p-4">
            <div className="text-xs font-semibold text-slate-400">Бренд</div>
            <div className="mt-1 text-xs font-bold text-slate-800 md:mt-2 md:text-sm">
              {product.brand?.name || "Не указан"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 md:rounded-2xl md:p-4">
            <div className="text-xs font-semibold text-slate-400">Наличие</div>
            <div className="mt-1 text-xs font-bold md:mt-2 md:text-sm">
              <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:mt-8 md:rounded-3xl md:p-6">
          <h3 className="mb-3 text-base font-black text-slate-800 md:mb-4 md:text-lg">
            Описание товара
          </h3>
          <p className="text-sm leading-6 text-slate-600 md:leading-7">
            {product.description || "Описание для данного товара пока не заполнено."}
          </p>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-xl font-black text-transparent md:text-2xl">
            Похожие товары
          </h2>
          <div className="product-grid grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} addToCart={addToCart} />
            ))}
          </div>
        </section>
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
    </main>
  );
}
