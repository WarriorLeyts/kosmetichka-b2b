"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { TopBar } from "./TopBar";
import { CatalogSidebar } from "./CatalogSidebar";
import { CatalogHeader } from "./CatalogHeader";
import { ProductGrid } from "./ProductGrid";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";

type Variant = { id: number; imageUrl: string; name: string };

function getDescendantGuids(categories: any[], parentGuid: string): string[] {
  const result = [parentGuid];
  const children = categories.filter((c) => c.parentGuid === parentGuid);
  for (const child of children) {
    result.push(...getDescendantGuids(categories, child.guid));
  }
  return result;
}

/** Skeleton card — matches the rough dimensions of ProductCard */
function SkeletonCard() {
  return (
    <div className="product-card" style={{ pointerEvents: "none" }}>
      <div className="product-image-box" style={{ background: "#f1f5f9", borderRadius: 12 }} />
      <div style={{ height: 14, width: "75%", background: "#e2e8f0", borderRadius: 6, margin: "10px 0 6px" }} />
      <div style={{ height: 12, width: "50%", background: "#e2e8f0", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 13, width: "60%", background: "#e2e8f0", borderRadius: 6, marginBottom: 4 }} />
      <div style={{ height: 13, width: "40%", background: "#e2e8f0", borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 36, background: "#e2e8f0", borderRadius: 12 }} />
    </div>
  );
}

export function CatalogClient({
  categories,
  brands,
}: {
  categories: any[];
  brands: any[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [categoryId, setCategoryId] = useState<number | null>(() => {
    const v = searchParams.get("categoryId");
    return v ? Number(v) : null;
  });
  const [brandGuids, setBrandGuids] = useState<string[]>(() => searchParams.getAll("brandGuid"));
  const [onlyStock, setOnlyStock] = useState(() => searchParams.get("onlyStock") === "true");
  const [priceMin, setPriceMin] = useState<number | null>(() => {
    const v = searchParams.get("priceMin");
    return v ? Number(v) : null;
  });
  const [priceMax, setPriceMax] = useState<number | null>(() => {
    const v = searchParams.get("priceMax");
    return v ? Number(v) : null;
  });
  const [sort, setSort] = useState(() => searchParams.get("sort") || "popularity");

  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 10000 });

  // Sync filters to URL for shareable links
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (categoryId !== null) params.set("categoryId", String(categoryId));
    brandGuids.forEach((g) => params.append("brandGuid", g));
    if (onlyStock) params.set("onlyStock", "true");
    if (priceMin !== null) params.set("priceMin", String(priceMin));
    if (priceMax !== null) params.set("priceMax", String(priceMax));
    if (sort !== "popularity") params.set("sort", sort);
    const qs = params.toString();
    router.replace(qs ? `/catalog?${qs}` : "/catalog", { scroll: false });
  }, [search, categoryId, brandGuids, onlyStock, priceMin, priceMax, sort, router]);

  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ── Shared variant picker state (V-1: single modal for all cards) ──────────
  const [pickerProduct, setPickerProduct] = useState<any | null>(null);
  const [pickerVariants, setPickerVariants] = useState<Variant[]>([]);
  const [pickerQtys, setPickerQtys] = useState<Record<number, number>>({});
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  const addToCart = useCartStore((state) => state.addToCart);
  const addToCartWithVariant = useCartStore((s) => s.addToCartWithVariant);
  const customer = useAuthStore((state) => state.customer);
  const isGuest = customer === null;

  const abortRef = useRef<AbortController | null>(null);
  // When true — skip the first filter-change effect (state was restored from sessionStorage)
  const isRestored = useRef(false);

  function handleOpenPicker(product: any, variants: Variant[]) {
    setPickerProduct(product);
    setPickerVariants(variants);
    setPickerQtys({});
  }

  function changePickerQty(variantId: number, delta: number) {
    setPickerQtys((prev) => {
      const cur = prev[variantId] ?? 0;
      const next = Math.max(0, cur + delta);
      return { ...prev, [variantId]: next };
    });
  }

  function submitPicker() {
    pickerVariants.forEach((v) => {
      const qty = pickerQtys[v.id] ?? 0;
      if (qty > 0) {
        for (let i = 0; i < qty; i++) {
          addToCartWithVariant(pickerProduct, v);
        }
      }
    });
    setPickerProduct(null);
    setPickerVariants([]);
    setPickerQtys({});
  }

  const pickerTotal = Object.values(pickerQtys).reduce((s, n) => s + n, 0);

  // ── Restore scroll position + loaded products on back-navigation ──────────
  useEffect(() => {
    try {
      // If the URL has explicit filter params, the user arrived via a direct link —
      // don't overwrite those filters with a stale sessionStorage snapshot.
      const urlHasFilters =
        searchParams.get("categoryId") ||
        searchParams.get("search") ||
        searchParams.getAll("brandGuid").length > 0 ||
        searchParams.get("onlyStock") ||
        searchParams.get("priceMin") ||
        searchParams.get("priceMax") ||
        searchParams.get("sort");
      if (urlHasFilters) return;

      const savedScroll = sessionStorage.getItem("catalog_scroll");
      const savedState = sessionStorage.getItem("catalog_products");

      if (savedScroll && savedState) {
        const state = JSON.parse(savedState);

        // Only skip re-fetch if the cached state looks consistent
        if ((state.products?.length ?? 0) > 0 && (state.total ?? 0) > 0) {
          isRestored.current = true;
        }

        setProducts(state.products ?? []);
        setTotal(state.total ?? 0);
        setPage(state.page ?? 1);
        setHasMore(state.hasMore ?? false);
        setSearch(state.search ?? "");
        setCategoryId(state.categoryId ?? null);
        setBrandGuids(state.brandGuids ?? []);
        setOnlyStock(state.onlyStock ?? false);
        setPriceMin(state.priceMin ?? null);
        setPriceMax(state.priceMax ?? null);
        setSort(state.sort ?? "popularity");

        // Scroll after paint — double-raf ensures DOM is fully rendered
        const scrollY = Number(savedScroll);
        sessionStorage.removeItem("catalog_scroll");

        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.scrollTo(0, scrollY))
        );
        return;
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save products to sessionStorage whenever the list updates ─────────────
  useEffect(() => {
    if (products.length === 0) return;
    try {
      sessionStorage.setItem(
        "catalog_products",
        JSON.stringify({ products, total, page, hasMore, search, categoryId, brandGuids, onlyStock, priceMin, priceMax, sort })
      );
    } catch {}
  }, [products, total, page, hasMore, search, categoryId, brandGuids, onlyStock, priceMin, priceMax, sort]);

  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/catalog/price-bounds")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.min === "number" && typeof data.max === "number") {
          setPriceBounds(data);
        }
      })
      .catch(() => {});
  }, []);

  function setPriceRange(min: number | null, max: number | null) {
    setPriceMin(min);
    setPriceMax(max);
  }

  async function loadProducts(reset = false) {
    if (!reset && loadingProducts) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingProducts(true);

    const nextPage = reset ? 1 : page + 1;

    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("sort", sort);

    if (search.trim()) {
      params.set("search", search.trim());
    }

    if (onlyStock) {
      params.set("onlyStock", "true");
    }

    const selectedCategory = categories.find(
      (category) => category.id === categoryId
    );

    if (selectedCategory?.guid) {
      const guids = getDescendantGuids(categories, selectedCategory.guid);
      guids.forEach((guid) => params.append("categoryGuid", guid));
    }

    brandGuids.forEach((guid) => params.append("brandGuid", guid));

    if (priceMin !== null) params.set("priceMin", String(priceMin));
    if (priceMax !== null) params.set("priceMax", String(priceMax));

    try {
      const res = await fetch(`/api/catalog/products?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await res.json();

      setProducts((prev) =>
        reset ? data.products || [] : [...prev, ...(data.products || [])]
      );

      setTotal(data.total || 0);
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error(error);
      }
      return;
    } finally {
      if (abortRef.current === controller) {
        setLoadingProducts(false);
      }
    }
  }

  useEffect(() => {
    // Skip first run if state was restored from sessionStorage
    if (isRestored.current) {
      isRestored.current = false;
      return;
    }

    syncUrl();

    const timer = setTimeout(() => {
      loadProducts(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    search,
    categoryId,
    brandGuids,
    onlyStock,
    priceMin,
    priceMax,
    sort,
  ]);

  useEffect(() => {
    function handleScroll() {
      if (loadingProducts || !hasMore) return;

      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 600;

      if (scrollPosition >= threshold) {
        loadProducts(false);
      }
    }

    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, [
    loadingProducts,
    hasMore,
    page,
    search,
    categoryId,
    brandGuids,
    onlyStock,
    priceMin,
    priceMax,
    sort,
  ]);

  return (
    <main className="catalog-page">
      <TopBar
        search={search}
        setSearch={setSearch}
        categories={categories}
        categoryId={categoryId}
        onCategorySelect={(id) => { setCategoryId(id); }}
      />

      {/* C-10: Guest CTA banner */}
      {isGuest && (
        <div className="guest-cta-banner">
          <span className="guest-cta-text">
            🔒 Войдите или зарегистрируйтесь, чтобы увидеть оптовые цены
          </span>
          <div className="guest-cta-actions">
            <Link href="/login" className="guest-cta-btn guest-cta-btn--primary">
              Войти
            </Link>
            <Link href="/register" className="guest-cta-btn guest-cta-btn--secondary">
              Регистрация
            </Link>
          </div>
        </div>
      )}

      <div
        className={`catalog-layout ${
          mobileFiltersOpen ? "mobile-filters-open" : ""
        }`}
      >
        <CatalogSidebar
          categories={categories}
          brands={brands}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          brandGuids={brandGuids}
          setBrandGuids={setBrandGuids}
          onlyStock={onlyStock}
          setOnlyStock={setOnlyStock}
          priceMin={priceMin}
          priceMax={priceMax}
          setPriceRange={setPriceRange}
          priceBounds={priceBounds}
          onClose={() => setMobileFiltersOpen(false)}
        />

        <section>
          <button
            type="button"
            className="mobile-filters-button"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal size={16} />
            Фильтры и цена
          </button>

          <CatalogHeader total={total} sort={sort} setSort={setSort} />

          <div className="relative">
            <ProductGrid
              products={products}
              addToCart={addToCart}
              onOpenPicker={handleOpenPicker}
            />
          </div>

          {/* V-5: Skeleton grid while first page loads */}
          {loadingProducts && products.length === 0 && (
            <div className="product-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Spinner while loading more pages */}
          {loadingProducts && products.length > 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-pink-500" />
            </div>
          )}

          {!loadingProducts && hasMore && products.length > 0 && (
            <div className="py-8 text-center text-sm font-semibold text-slate-400">
              Прокрутите ниже, чтобы загрузить ещё
            </div>
          )}
        </section>
      </div>

      {/* V-1: Single shared image zoom lightbox */}
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

      {/* V-1: Single shared variant picker modal */}
      {pickerProduct && pickerVariants.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => setPickerProduct(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-base font-bold text-slate-800 line-clamp-2">
              {pickerProduct.name}
            </h3>
            <p className="mb-4 text-sm text-slate-500">Выберите варианты и количество</p>

            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
              {pickerVariants.map((v) => {
                const qty = pickerQtys[v.id] ?? 0;
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
                        onClick={() => changePickerQty(v.id, -1)}
                        disabled={qty === 0}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-600 disabled:opacity-30 hover:bg-slate-50"
                      >−</button>
                      <span className="w-6 text-center text-sm font-bold">{qty}</span>
                      <button
                        onClick={() => changePickerQty(v.id, 1)}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center text-slate-600 hover:bg-slate-50"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPickerProduct(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                onClick={submitPicker}
                disabled={pickerTotal === 0}
                className="flex-1 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                В корзину {pickerTotal > 0 ? `(${pickerTotal})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
