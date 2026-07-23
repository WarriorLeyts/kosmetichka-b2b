"use client";

import Link from "next/link";
import { resolveImageUrl } from "@/lib/image";
import { ArrowLeft, Heart, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { ProductGallery } from "./ProductGallery";
import { ProductCard } from "./ProductCard";
import { getStockLabel } from "@/lib/utils";
import { resolveCustomerPriceType, priceFor, priceTypeLabel } from "@/lib/pricing";

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

  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [variantError, setVariantError] = useState(false);
  const [showAllVariants, setShowAllVariants] = useState(false);

  const VARIANTS_INITIAL = 8;

  const stock = getStockLabel(product.stock);
  const priceType = resolveCustomerPriceType(customer);
  const mainPrice = priceFor(product, priceType);
  const mainLabel = priceTypeLabel(priceType);

  const hasVariants = product.variants && product.variants.length > 0;

  function handleAddToCart() {
    if (hasVariants && !selectedVariant) {
      setVariantError(true);
      setTimeout(() => setVariantError(false), 600);
      return;
    }
    if (hasVariants && selectedVariant) {
      addToCartWithVariant(product, {
        id: selectedVariant.id,
        name: selectedVariant.name,
        imageUrl: selectedVariant.image?.path
          ? resolveImageUrl(selectedVariant.image.path) ?? ""
          : "",
      });
    } else {
      addToCart(product);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-3 md:p-6">
      {/* Хлебные крошки */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
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

      {/* Назад */}
      <Link
        href="/catalog"
        className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-pink-500"
      >
        <ArrowLeft size={18} />
        Назад в каталог
      </Link>

      {/* Основная секция: галерея + инфо (ровно 2 дочерних элемента!) */}
      <section className="mt-4 grid grid-cols-1 gap-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:gap-8 md:rounded-[32px] md:p-8 xl:grid-cols-[1fr_380px]">

        {/* Левая колонка — галерея */}
        <ProductGallery images={product.images} productName={product.name} />

        {/* Правая колонка — информация о товаре */}
        <div className="flex flex-col">
          {/* Теги категория + бренд */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {product.category?.name && (
              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-500">
                {product.category.name}
              </span>
            )}
            {product.brand?.name && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                {product.brand.name}
              </span>
            )}
          </div>

          {/* Название */}
          <h1 className="mb-3 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-xl font-black leading-tight text-transparent md:text-3xl">
            {product.name}
          </h1>

          {/* Штрихкод / артикул / наличие */}
          <div className="mb-4 space-y-1.5 text-xs font-semibold text-slate-600">
            <p>Штрихкод: {product.barcode || "—"}</p>
            <p>Артикул: {product.article || "—"}</p>
            <p>
              Наличие:{" "}
              <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
            </p>
          </div>

          {/* Выбор варианта */}
          {hasVariants && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-bold text-slate-700">
                Вариант товара <span className="text-pink-500">*</span>
                {product.variants.length > VARIANTS_INITIAL && (
                  <span className="ml-2 text-xs font-semibold text-slate-400">
                    ({product.variants.length} шт.)
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {(showAllVariants
                  ? product.variants
                  : product.variants.slice(0, VARIANTS_INITIAL)
                ).map((variant: any) => {
                  const src = variant.image?.path
                    ? resolveImageUrl(variant.image.path)
                    : null;
                  const isSelected = selectedVariant?.id === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariant(variant);
                        setVariantError(false);
                      }}
                      title={variant.name}
                      className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-1.5 transition ${
                        isSelected
                          ? "border-pink-500 bg-pink-50 ring-2 ring-pink-200"
                          : variantError
                          ? "border-red-400 bg-red-50"
                          : "border-slate-200 bg-white hover:border-pink-300"
                      }`}
                      style={{ width: 70 }}
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={variant.name}
                          className="h-11 w-11 rounded-lg object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-400">
                          ?
                        </div>
                      )}
                      <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-slate-700">
                        {variant.name}
                      </span>
                    </button>
                  );
                })}

                {/* Кнопка «Показать все» */}
                {!showAllVariants && product.variants.length > VARIANTS_INITIAL && (
                  <button
                    type="button"
                    onClick={() => setShowAllVariants(true)}
                    className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-1.5 text-slate-500 transition hover:border-pink-300 hover:bg-pink-50 hover:text-pink-500"
                    style={{ width: 70, minHeight: 72 }}
                  >
                    <span className="text-lg font-black leading-none">
                      +{product.variants.length - VARIANTS_INITIAL}
                    </span>
                    <span className="text-[10px] font-semibold leading-tight text-center">
                      ещё
                    </span>
                  </button>
                )}
              </div>

              {/* Свернуть */}
              {showAllVariants && product.variants.length > VARIANTS_INITIAL && (
                <button
                  type="button"
                  onClick={() => setShowAllVariants(false)}
                  className="mt-2 w-full cursor-pointer rounded-xl border border-slate-200 py-1.5 text-xs font-semibold text-slate-500 hover:border-pink-200 hover:text-pink-500"
                >
                  Свернуть
                </button>
              )}

              {variantError && (
                <p className="mt-2 text-xs font-bold text-red-500" style={{ animation: "shake 0.4s ease" }}>
                  Выберите вариант товара
                </p>
              )}
              <style>{`
                @keyframes shake {
                  0%   { transform: translateX(0); }
                  20%  { transform: translateX(-6px); }
                  40%  { transform: translateX(6px); }
                  60%  { transform: translateX(-4px); }
                  80%  { transform: translateX(4px); }
                  100% { transform: translateX(0); }
                }
              `}</style>
            </div>
          )}

          {/* Цена */}
          <div className="mb-4 rounded-[16px] bg-slate-50 p-4">
            {customer && (
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-500">Розница:</span>
                <b>{product.retailPrice ?? 0} ₽</b>
              </div>
            )}
            <div className="flex justify-between text-xl font-black">
              <span className="text-slate-500">{customer ? mainLabel : "Цена"}:</span>
              <b className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent">
                {mainPrice} ₽
              </b>
            </div>
          </div>

          {/* Кнопки */}
          <div className="mt-auto flex gap-2">
            <button
              onClick={handleAddToCart}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-lg"
            >
              <ShoppingCart size={16} />
              В корзину
            </button>
            <button
              onClick={() => toggleFavorite(product)}
              className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border ${
                isFavorite
                  ? "border-pink-200 bg-pink-50 text-pink-500"
                  : "border-slate-200 bg-white text-pink-500"
              }`}
            >
              <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </section>

      {/* Описание */}
      {product.description && (
        <section className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[32px] md:p-8">
          <h2 className="mb-3 text-base font-black text-slate-800 md:text-lg">
            Описание товара
          </h2>
          <p className="text-sm leading-7 text-slate-600">{product.description}</p>
        </section>
      )}

      {/* Похожие товары */}
      {relatedProducts.length > 0 && (
        <section className="mt-6">
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
    </main>
  );
}
