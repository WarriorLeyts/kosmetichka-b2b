"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, Heart, ShoppingCart } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useFavoriteStore } from "@/store/favoriteStore";
import { useAuthStore } from "@/store/authStore";
import { useWishlistStore } from "@/store/wishlistStore";
import { ProductGallery } from "./ProductGallery";
import { ProductCard } from "./ProductCard";
import { TopBar } from "./TopBar";
import { getStockLabel } from "@/lib/utils";
import { resolveCustomerPriceType, priceFor, priceTypeLabel } from "@/lib/pricing";

type Variant = { id: number; imageUrl: string; name: string };

// ── Description renderer ──────────────────────────────────────────────────────
function renderDescription(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const nodes: React.ReactNode[] = [];

  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(
        <h4
          key={`h${i}`}
          className="mt-5 first:mt-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-sm font-black text-transparent md:text-base"
        >
          {part.slice(2, -2)}
        </h4>
      );
    } else {
      const trimmed = part.trim();
      if (!trimmed) return;

      if (trimmed.includes("•")) {
        trimmed.split("•").filter((s) => s.trim()).forEach((item, j) => {
          nodes.push(
            <div key={`b${i}_${j}`} className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-slate-600">
              <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-pink-400" />
              <span>{item.trim()}</span>
            </div>
          );
        });
      } else {
        nodes.push(
          <p key={`p${i}`} className="mt-1.5 text-sm leading-7 text-slate-600">{trimmed}</p>
        );
      }
    }
  });

  return <div>{nodes}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProductPageClient({
  product,
  relatedProducts,
}: {
  product: any;
  relatedProducts: any[];
}) {
  const [search, setSearch] = useState("");

  const addToCart        = useCartStore((s) => s.addToCart);
  const addToCartWithVariant = useCartStore((s) => s.addToCartWithVariant);
  const increaseQty      = useCartStore((s) => s.increaseQuantity);
  const decreaseQty      = useCartStore((s) => s.decreaseQuantity);
  const openCart         = useCartStore((s) => s.openCart);
  const cartQty          = useCartStore(
    (s) => s.cart.find((i) => i.cartKey === String(product.id))?.quantity ?? 0
  );

  // ── Variant picker ────────────────────────────────────────────────────────
  const [variants, setVariants]       = useState<Variant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showPicker, setShowPicker]   = useState(false);
  const [variantQtys, setVariantQtys] = useState<Record<number, number>>({});
  const [zoomedImg, setZoomedImg]     = useState<string | null>(null);

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
      const next = Math.max(0, cur + delta);
      return { ...prev, [variantId]: next };
    });
  }

  function submitVariants() {
    (variants ?? []).forEach((v) => {
      const qty = variantQtys[v.id] ?? 0;
      if (qty > 0) {
        for (let i = 0; i < qty; i++) addToCartWithVariant(product, v);
      }
    });
    setShowPicker(false);
    setVariantQtys({});
  }

  const totalSelected = Object.values(variantQtys).reduce((s, n) => s + n, 0);

  const toggleFavorite = useFavoriteStore((s) => s.toggleFavorite);
  const isFavorite     = useFavoriteStore((s) =>
    s.favorites.some((item) => item.id === product.id)
  );

  const customer = useAuthStore((s) => s.customer);

  // ── Wishlist ──────────────────────────────────────────────────────────────
  const fetchWishlist   = useWishlistStore((s) => s.fetchWishlist);
  const toggleWishlist  = useWishlistStore((s) => s.toggle);
  const isInWishlist    = useWishlistStore((s) => s.has(product.id));
  const [wishlistToast, setWishlistToast] = useState<string | null>(null);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  async function handleWishlistToggle() {
    const result = await toggleWishlist(product.id);
    if (result === "unauthorized") {
      setWishlistToast("Войдите в аккаунт, чтобы добавить в лист ожидания");
      setTimeout(() => setWishlistToast(null), 3500);
    } else if (result === "added") {
      setWishlistToast("Уведомим вас, когда товар появится в наличии");
      setTimeout(() => setWishlistToast(null), 3000);
    }
  }

  const stock      = getStockLabel(product.stock);
  const isOutOfStock = (product.stock ?? 0) <= 0;
  const priceType  = resolveCustomerPriceType(customer);
  const mainPrice  = priceFor(product, priceType);
  const mainLabel  = priceTypeLabel(priceType);
  const retailPrice = product.retailPrice ?? 0;
  const discount   = customer && retailPrice > mainPrice && mainPrice > 0
    ? Math.round((1 - mainPrice / retailPrice) * 100)
    : 0;

  // ── Inner nav (tabs) ──────────────────────────────────────────────────────
  const tabs = [
    { id: "product-top",   label: "О товаре" },
    { id: "characteristics", label: "Характеристики" },
    { id: "description",   label: "Описание" },
    ...(relatedProducts.length > 0 ? [{ id: "related", label: "Похожие товары" }] : []),
  ];
  const [activeTab, setActiveTab] = useState("product-top");

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 120; // topbar + inner nav height
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActiveTab(id);
  }

  // Track which section is visible
  useEffect(() => {
    const sectionIds = tabs.map((t) => t.id);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveTab(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedProducts.length]);

  return (
    <>
      {/* ── Global TopBar ──────────────────────────────────────────────── */}
      <TopBar search={search} setSearch={setSearch} />

      <div className="min-h-screen bg-slate-50">

        {/* ── Breadcrumbs ──────────────────────────────────────────────── */}
        <div className="mx-auto max-w-7xl px-4 pt-5 pb-3 md:px-6 md:pt-6">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-400">
            <Link href="/" className="hover:text-pink-500">Главная</Link>
            <span>/</span>
            <Link href="/catalog" className="hover:text-pink-500">Каталог</Link>
            {product.brand?.name && (
              <>
                <span>/</span>
                <span className="text-slate-500">{product.brand.name}</span>
              </>
            )}
            <span>/</span>
            <span className="line-clamp-1 max-w-[200px] text-slate-700">{product.name}</span>
          </div>
        </div>

        {/* ── Product hero (gallery + info) ───────────────────────────── */}
        <section id="product-top" className="mx-auto max-w-7xl px-4 pb-6 md:px-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">

            {/* Gallery — sticky on desktop */}
            <div className="xl:sticky xl:top-[120px] xl:self-start">
              <ProductGallery images={product.images} productName={product.name} />
            </div>

            {/* Right: info + price card */}
            <div className="flex flex-col gap-4">

              {/* Category / brand badges */}
              <div className="flex flex-wrap gap-2">
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

              {/* Title */}
              <h1 className="text-xl font-black leading-tight md:text-3xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-transparent">
                {product.name}
              </h1>

              {/* Stock pill */}
              <div>
                <span className={`stock-pill ${stock.className}`}>{stock.text}</span>
              </div>

              {/* ── Price card ─────────────────────────────────────────── */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

                {/* Discount badge */}
                {discount > 0 && (
                  <div className="mb-3 inline-flex items-center rounded-lg bg-pink-50 px-3 py-1 text-sm font-black text-pink-500">
                    −{discount}%
                  </div>
                )}

                {/* Price row */}
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-slate-900">
                    {mainPrice.toLocaleString("ru-RU")} ₽
                  </span>
                  {discount > 0 && (
                    <span className="text-base text-slate-400 line-through">
                      {retailPrice.toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                </div>
                {customer && (
                  <div className="mt-0.5 text-xs font-semibold text-slate-400">{mainLabel}</div>
                )}

                {/* Stepper / cart buttons */}
                <div className="mt-5 flex gap-2">
                  {isOutOfStock ? (
                    <button
                      disabled
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-200 text-sm font-black text-slate-400 cursor-not-allowed"
                    >
                      <ShoppingCart size={16} />
                      Нет в наличии
                    </button>
                  ) : cartQty > 0 ? (
                    <>
                      <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 h-12">
                        <button
                          onClick={() => decreaseQty(String(product.id))}
                          className="flex h-full w-12 items-center justify-center text-xl font-bold text-slate-600 hover:bg-slate-100 transition"
                        >−</button>
                        <span className="min-w-[40px] text-center text-base font-black text-slate-800">
                          {cartQty}
                        </span>
                        <button
                          onClick={() => increaseQty(String(product.id))}
                          className="flex h-full w-12 items-center justify-center text-xl font-bold text-slate-600 hover:bg-slate-100 transition"
                        >+</button>
                      </div>
                      <button
                        onClick={openCart}
                        className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-md transition hover:opacity-90"
                      >
                        <ShoppingCart size={16} />
                        В корзине
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleAddToCart}
                      disabled={loadingVariants}
                      className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 text-sm font-black text-white shadow-md transition hover:opacity-90 disabled:opacity-70"
                    >
                      <ShoppingCart size={16} />
                      {loadingVariants ? "…" : "В корзину"}
                    </button>
                  )}

                  {/* Bell button — only for out-of-stock */}
                  {isOutOfStock && (
                    <button
                      onClick={handleWishlistToggle}
                      title={isInWishlist ? "Убрать из листа ожидания" : "Уведомить о появлении"}
                      className={`flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border transition ${
                        isInWishlist
                          ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                          : "border-slate-200 bg-white text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                      }`}
                    >
                      <Bell size={18} fill={isInWishlist ? "currentColor" : "none"} />
                    </button>
                  )}

                  <button
                    onClick={() => toggleFavorite(product)}
                    className={`flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border transition ${
                      isFavorite
                        ? "border-pink-200 bg-pink-50 text-pink-500"
                        : "border-slate-200 bg-white text-pink-400 hover:bg-pink-50"
                    }`}
                  >
                    <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                </div>

                {/* Wishlist toast */}
                {wishlistToast && (
                  <div className="mt-3 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-2.5 text-sm font-semibold text-indigo-700">
                    🔔 {wishlistToast}
                  </div>
                )}
              </div>

              {/* Quick characteristics */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Штрихкод", value: product.barcode || "—" },
                  { label: "Артикул",  value: product.article  || "—" },
                  { label: "Бренд",    value: product.brand?.name || "—" },
                  { label: "Категория", value: product.category?.name || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                    <div className="mt-1 text-xs font-bold text-slate-800 line-clamp-2">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Sticky inner nav (WB-style tabs) ────────────────────────── */}
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="flex gap-0 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => scrollToSection(tab.id)}
                  className={`flex-shrink-0 border-b-2 px-4 py-3 text-sm font-bold transition ${
                    activeTab === tab.id
                      ? "border-pink-500 text-pink-500"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content sections ─────────────────────────────────────────── */}
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">

          {/* Characteristics */}
          <section id="characteristics" className="mb-10 scroll-mt-32">
            <h2 className="mb-4 text-xl font-black text-slate-800">Характеристики</h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {[
                { label: "Артикул",   value: product.article  || "—" },
                { label: "Штрихкод",  value: product.barcode  || "—" },
                { label: "Бренд",     value: product.brand?.name   || "—" },
                { label: "Категория", value: product.category?.name || "—" },
                { label: "Наличие",   value: stock.text },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center px-5 py-3">
                  <span className="w-40 flex-shrink-0 text-sm text-slate-400">{label}</span>
                  <span className="text-sm font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Description */}
          <section id="description" className="mb-10 scroll-mt-32">
            <h2 className="mb-4 text-xl font-black text-slate-800">Описание</h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
              {product.description
                ? renderDescription(product.description)
                : <p className="text-sm text-slate-400">Описание пока не добавлено.</p>
              }
            </div>
          </section>
        </div>

        {/* ── Related products ─────────────────────────────────────────── */}
        {relatedProducts.length > 0 && (
          <section id="related" className="mx-auto max-w-7xl scroll-mt-32 px-4 pb-12 md:px-6">
            <h2 className="mb-5 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 bg-clip-text text-xl font-black text-transparent md:text-2xl">
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

      {/* ── Image zoom lightbox ─────────────────────────────────────────── */}
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

      {/* ── Variant picker modal ─────────────────────────────────────────── */}
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
