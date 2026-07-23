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

export function ProductPageClient({
  product,
  relatedProducts,
}: {
  product: any;
  relatedProducts: any[];
}) {
  const addToCart = useCartStore((state) => state.addToCart);
  const toggleFavorite = useFavoriteStore((state) => state.toggleFavorite);
  const customer = useAuthStore((state) => state.customer);

  const isFavorite = useFavoriteStore((state) =>
    state.favorites.some((item) => item.id === product.id)
  );

  const imagePath = product.images?.[0]?.path
    ? resolveImageUrl(product.images[0].path)
    : null;

  const stock = getStockLabel(product.stock);
  const priceType = resolveCustomerPriceType(customer);
  const mainPrice = priceFor(product, priceType);
  const mainLabel = priceTypeLabel(priceType);

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
  <Link href="/" className="hover:text-pink-500">
    Главная
  </Link>

  <span>/</span>

  <Link href="/catalog" className="hover:text-pink-500">
    Каталог
  </Link>

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
        <ProductGallery
          images={product.images}
          productName={product.name}
        />

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
              <span className={`stock-pill ${stock.className}`}>
                {stock.text}
              </span>
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
              onClick={() => addToCart(product)}
              className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-lg md:h-14 md:rounded-2xl md:text-base"
            >
              <ShoppingCart size={16} />
              В корзину
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
    <div className="text-xs font-semibold text-slate-400">
      Бренд
    </div>

    <div className="mt-1 text-xs font-bold text-slate-800 md:mt-2 md:text-sm">
      {product.brand?.name || "Не указан"}
    </div>
  </div>

  <div className="rounded-xl border border-slate-200 bg-white p-3 md:rounded-2xl md:p-4">
    <div className="text-xs font-semibold text-slate-400">
      Наличие
    </div>

    <div className="mt-1 text-xs font-bold md:mt-2 md:text-sm">
      <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
    </div>
  </div>
</div>
<div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:mt-8 md:rounded-3xl md:p-6">
  <h3 className="mb-3 text-base font-black text-slate-800 md:mb-4 md:text-lg">
    Описание товара
  </h3>

  {product.description ? (
    <div
      className="text-sm leading-6 text-slate-600 md:leading-7 [&_strong]:font-bold [&_strong]:text-slate-800"
      dangerouslySetInnerHTML={{
        __html: product.description
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/\n/g, "<br />"),
      }}
    />
  ) : (
    <p className="text-sm leading-6 text-slate-600 md:leading-7">
      Описание для данного товара пока не заполнено.
    </p>
  )}
</div>
      </section>
      {relatedProducts.length > 0 && (
  <section className="mt-8">
    <h2 className="mb-4 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-xl font-black text-transparent md:text-2xl">
      Похожие товары
    </h2>

    <div className="product-grid grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {relatedProducts.map((item) => (
        <ProductCard
          key={item.id}
          product={item}
          addToCart={addToCart}
        />
      ))}
    </div>
  </section>
)}
    </main>
  );
}