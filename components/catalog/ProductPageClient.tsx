"use client";

import Link from "next/link";
import { resolveImageUrl } from "@/lib/image";
import { Heart, ShoppingCart, Star, Package, ChevronRight } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { ProductGallery } from "./ProductGallery";
import { ProductCard } from "./ProductCard";
import { TopBar } from "./TopBar";
import { CartDrawer } from "./CartDrawer";
import { FavoriteDrawer } from "./FavoriteDrawer";
import { getStockLabel } from "@/lib/utils";
import { resolveCustomerPriceType, priceFor, priceTypeLabel } from "@/lib/pricing";
import { useState } from "react";

export function ProductPageClient({
  product,
  relatedProducts,
}: {
  product: any;
  relatedProducts: any[];
}) {
  const [search, setSearch] = useState("");

  const addToCart = useCartStore((state) => state.addToCart);
  const toggleFavorite = useFavoriteStore((state) => state.toggleFavorite);
  const customer = useAuthStore((state) => state.customer);

  const isFavorite = useFavoriteStore((state) =>
    state.favorites.some((item) => item.id === product.id)
  );

  const stock = getStockLabel(product.stock);
  const priceType = resolveCustomerPriceType(customer);
  const mainPrice = priceFor(product, priceType);
  const retailPrice = product.retailPrice ?? 0;
  const mainLabel = priceTypeLabel(priceType);

  const renderDescription = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br />");

  return (
    <div className="min-h-screen bg-slate-50">
      <TopBar search={search} setSearch={setSearch} />
      <CartDrawer />
      <FavoriteDrawer />

      <main className="mx-auto max-w-[1400px] px-3 py-4 md:px-6 md:py-6">
        {/* Хлебные крошки */}
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm font-medium text-slate-500">
          <Link href="/" className="hover:text-pink-500">Главная</Link>
          <ChevronRight size={14} className="text-slate-300" />
          <Link href="/catalog" className="hover:text-pink-500">Каталог</Link>
          {product.category?.name && (
            <>
              <ChevronRight size={14} className="text-slate-300" />
              <span className="text-slate-600">{product.category.name}</span>
            </>
          )}
          {product.brand?.name && (
            <>
              <ChevronRight size={14} className="text-slate-300" />
              <span className="text-slate-600">{product.brand.name}</span>
            </>
          )}
          <ChevronRight size={14} className="text-slate-300" />
          <span className="line-clamp-1 text-slate-800 font-semibold">{product.name}</span>
        </nav>

        {/* Основная секция */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">

          {/* Левая колонка: галерея + описание */}
          <div className="space-y-6">
            {/* Название на мобиле */}
            <div className="lg:hidden">
              {product.brand?.name && (
                <span className="text-sm font-bold text-pink-500">{product.brand.name}</span>
              )}
              <h1 className="mt-1 text-xl font-black text-slate-800">{product.name}</h1>
            </div>

            {/* Галерея */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
              <ProductGallery images={product.images} productName={product.name} />
            </div>

            {/* Характеристики */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
              <h2 className="mb-4 text-lg font-black text-slate-800">Характеристики</h2>
              <dl className="divide-y divide-slate-100">
                {product.article && (
                  <div className="flex py-2.5 text-sm">
                    <dt className="w-1/2 font-medium text-slate-500">Артикул</dt>
                    <dd className="w-1/2 font-semibold text-slate-800">{product.article}</dd>
                  </div>
                )}
                {product.barcode && (
                  <div className="flex py-2.5 text-sm">
                    <dt className="w-1/2 font-medium text-slate-500">Штрихкод</dt>
                    <dd className="w-1/2 font-semibold text-slate-800">{product.barcode}</dd>
                  </div>
                )}
                {product.brand?.name && (
                  <div className="flex py-2.5 text-sm">
                    <dt className="w-1/2 font-medium text-slate-500">Бренд</dt>
                    <dd className="w-1/2 font-semibold text-slate-800">{product.brand.name}</dd>
                  </div>
                )}
                {product.category?.name && (
                  <div className="flex py-2.5 text-sm">
                    <dt className="w-1/2 font-medium text-slate-500">Категория</dt>
                    <dd className="w-1/2 font-semibold text-slate-800">{product.category.name}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Описание */}
            {product.description && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:rounded-3xl md:p-6">
                <h2 className="mb-4 text-lg font-black text-slate-800">Описание товара</h2>
                <div
                  className="text-sm leading-7 text-slate-600 [&_strong]:font-bold [&_strong]:text-slate-800"
                  dangerouslySetInnerHTML={{ __html: renderDescription(product.description) }}
                />
              </div>
            )}
          </div>

          {/* Правая колонка: инфо + цена (sticky) */}
          <div className="space-y-4">
            <div className="lg:sticky lg:top-4 space-y-4">

              {/* Название и бренд — только на десктопе */}
              <div className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:block md:rounded-3xl">
                {product.brand?.name && (
                  <Link href="/catalog" className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-pink-500 hover:text-pink-600">
                    {product.brand.name}
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">Бренд</span>
                  </Link>
                )}
                <h1 className="text-xl font-black leading-snug text-slate-800 md:text-2xl">
                  {product.name}
                </h1>

                {/* Наличие */}
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Package size={15} className="text-slate-400" />
                  <span className={`font-bold ${stock.className}`}>{stock.text}</span>
                </div>
              </div>

              {/* Блок цены */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:rounded-3xl">
                {/* Цены */}
                <div className="mb-4 space-y-1">
                  {customer ? (
                    <>
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-black text-slate-900">{mainPrice} ₽</span>
                        {retailPrice > 0 && retailPrice !== mainPrice && (
                          <span className="text-sm font-semibold text-slate-400 line-through">{retailPrice} ₽</span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">{mainLabel} цена</div>
                    </>
                  ) : (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                      <Link href="/login" className="text-pink-500 hover:underline">Войдите</Link>, чтобы увидеть цену
                    </div>
                  )}
                </div>

                {/* Кнопки */}
                <div className="space-y-2.5">
                  <button
                    onClick={() => addToCart(product)}
                    className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-md transition hover:opacity-90 active:scale-[0.98]"
                  >
                    <ShoppingCart size={17} />
                    Добавить в корзину
                  </button>

                  <button
                    onClick={() => toggleFavorite(product)}
                    className={`flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition active:scale-[0.98] ${
                      isFavorite
                        ? "border-pink-200 bg-pink-50 text-pink-500"
                        : "border-slate-200 bg-white text-slate-600 hover:border-pink-200 hover:text-pink-500"
                    }`}
                  >
                    <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
                    {isFavorite ? "В избранном" : "В избранное"}
                  </button>
                </div>

                {/* Доп. инфо */}
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-500">Наличие</span>
                    <span className={`font-bold ${stock.className}`}>{stock.text}</span>
                  </div>
                  {product.article && (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-500">Артикул</span>
                      <span className="font-semibold text-slate-700">{product.article}</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Похожие товары */}
        {relatedProducts.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-5 text-xl font-black text-slate-800 md:text-2xl">
              Похожие товары
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {relatedProducts.map((item) => (
                <ProductCard key={item.id} product={item} addToCart={addToCart} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
