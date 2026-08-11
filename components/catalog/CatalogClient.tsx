"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { TopBar } from "./TopBar";
import { CatalogSidebar } from "./CatalogSidebar";
import { CatalogHeader } from "./CatalogHeader";
import { ProductGrid } from "./ProductGrid";
import { useCartStore } from "@/store/cartStore";

function getDescendantGuids(categories: any[], parentGuid: string): string[] {
  const result = [parentGuid];
  const children = categories.filter((c) => c.parentGuid === parentGuid);
  for (const child of children) {
    result.push(...getDescendantGuids(categories, child.guid));
  }
  return result;
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

  const addToCart = useCartStore((state) => state.addToCart);

  const abortRef = useRef<AbortController | null>(null);
  // When true — skip the first filter-change effect (state was restored from sessionStorage)
  const isRestored = useRef(false);

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
        // (products present AND total > 0). If total=0 with products it means
        // the cache was saved during a broken state — do a fresh load instead.
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
            <ProductGrid products={products} addToCart={addToCart} />
          </div>

          {loadingProducts && products.length === 0 && (
            <div className="flex items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-pink-500" />
            </div>
          )}

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

      <footer className="mt-4 border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        <Link href="/privacy" className="hover:text-pink-500 hover:underline transition-colors">Политика конфиденциальности</Link>
        <span className="mx-2">·</span>
        <Link href="/agreement" className="hover:text-pink-500 hover:underline transition-colors">Пользовательское соглашение</Link>
        <span className="mx-2">·</span>
        <Link href="/contacts" className="hover:text-pink-500 hover:underline transition-colors">Реквизиты</Link>
      </footer>
    </main>
  );
}
