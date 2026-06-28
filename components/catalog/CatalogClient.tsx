"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [brandGuids, setBrandGuids] = useState<string[]>([]);
  const [onlyStock, setOnlyStock] = useState(false);
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [sort, setSort] = useState("popularity");

  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 10000 });

  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const addToCart = useCartStore((state) => state.addToCart);

  const abortRef = useRef<AbortController | null>(null);

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

    // Cancel whatever request is still in flight — without this, fast
    // typing/filter toggling piles up overlapping requests on both the
    // browser and the server instead of replacing them.
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
      <TopBar search={search} setSearch={setSearch} />

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

            {loadingProducts && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-white/70 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-pink-500" />
              </div>
            )}
          </div>

          {!loadingProducts && hasMore && products.length > 0 && (
            <div className="py-8 text-center text-sm font-semibold text-slate-400">
              Прокрутите ниже, чтобы загрузить ещё
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
