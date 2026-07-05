"use client";

import { useState, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CatalogProduct = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  stock: number | null;
  price: number;
  imagePath: string | null;
  hasVariants: boolean;
};

type CatalogCategory = {
  id: number;
  guid: string;
  name: string;
  parentGuid: string | null;
};

type ProductImage = {
  id: number;
  path: string;
  url: string;
};

type Variant = {
  id: number;
  imageId: number;
  imageUrl: string;
  name: string;
};

type DraftVariant = {
  imageId: number;
  imageUrl: string;
  name: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getProductImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `https://kosmetichka-opt.ru/api/1c/${imagePath}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminProductsClient() {
  // ── Catalog modal ──
  const [showCatalog, setShowCatalog] = useState(false);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedCatGuid, setSelectedCatGuid] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const paginationRef = useRef({ offset: 0, hasMore: false, loading: false });

  // ── Variant modal ──
  const [variantProduct, setVariantProduct] = useState<CatalogProduct | null>(null);
  const [modalImages, setModalImages] = useState<ProductImage[]>([]);
  const [drafts, setDrafts] = useState<DraftVariant[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Track which products have variants (updated after save)
  const [variantCounts, setVariantCounts] = useState<Record<number, number>>({});

  // ── Catalog functions ──────────────────────────────────────────────────────

  function buildSearchUrl(q: string, catGuid: string, offset: number) {
    const params = new URLSearchParams({ limit: "40", offset: String(offset) });
    if (q.length >= 2) params.set("q", q);
    if (catGuid) params.set("categoryGuid", catGuid);
    return `/api/admin/products/search?${params}`;
  }

  async function fetchProducts(q: string, catGuid: string) {
    paginationRef.current = { offset: 0, hasMore: false, loading: false };
    setSearchResults([]);
    setHasMore(false);
    const res = await fetch(buildSearchUrl(q, catGuid, 0));
    if (res.ok) {
      const data = await res.json();
      const products = data.products ?? [];
      const more = data.hasMore ?? false;
      // Merge with known variant counts
      setSearchResults(products);
      paginationRef.current = { offset: products.length, hasMore: more, loading: false };
      setHasMore(more);
    }
  }

  async function loadMore(q: string, catGuid: string) {
    const p = paginationRef.current;
    if (!p.hasMore || p.loading) return;
    p.loading = true;
    setLoadingMore(true);
    try {
      const res = await fetch(buildSearchUrl(q, catGuid, p.offset));
      if (res.ok) {
        const data = await res.json();
        const products = data.products ?? [];
        const more = data.hasMore ?? false;
        setSearchResults((prev) => [...prev, ...products]);
        p.offset += products.length;
        p.hasMore = more;
        setHasMore(more);
      }
    } finally {
      p.loading = false;
      setLoadingMore(false);
    }
  }

  function openCatalog() {
    setSearchQuery("");
    setSelectedCatGuid("");
    setShowCatalog(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats: CatalogCategory[] = d.categories ?? [];
        setCategories(cats);
        const topGuids = cats.filter((c) => !c.parentGuid).map((c) => c.guid);
        setExpandedCats(new Set(topGuids));
      });
    fetchProducts("", "");
  }

  function toggleCat(guid: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }

  function selectCat(guid: string) {
    const newGuid = guid === selectedCatGuid ? "" : guid;
    setSelectedCatGuid(newGuid);
    fetchProducts(searchQuery, newGuid);
  }

  function handleCatalogSearch(q: string) {
    setSearchQuery(q);
    fetchProducts(q, selectedCatGuid);
  }

  // Category tree rendering
  const topCats = categories.filter((c) => !c.parentGuid);
  function renderCatTree() {
    return topCats.map((top) => {
      const children = categories.filter((c) => c.parentGuid === top.guid);
      const isTopExpanded = expandedCats.has(top.guid);
      const isTopSelected = selectedCatGuid === top.guid;
      return (
        <div key={top.guid}>
          <div className="flex items-center gap-1">
            {children.length > 0 ? (
              <button
                onClick={() => toggleCat(top.guid)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs"
              >
                {isTopExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <button
              onClick={() => selectCat(top.guid)}
              className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                isTopSelected ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-slate-100 text-slate-700"
              }`}
            >
              {top.name}
            </button>
          </div>
          {isTopExpanded && children.map((child) => {
            const grandchildren = categories.filter((c) => c.parentGuid === child.guid);
            const isChildExpanded = expandedCats.has(child.guid);
            const isChildSelected = selectedCatGuid === child.guid;
            return (
              <div key={child.guid} className="ml-5">
                <div className="flex items-center gap-1">
                  {grandchildren.length > 0 ? (
                    <button
                      onClick={() => toggleCat(child.guid)}
                      className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs"
                    >
                      {isChildExpanded ? "▼" : "▶"}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <button
                    onClick={() => selectCat(child.guid)}
                    className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                      isChildSelected ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    {child.name}
                  </button>
                </div>
                {isChildExpanded && grandchildren.map((grand) => {
                  const isGrandSelected = selectedCatGuid === grand.guid;
                  return (
                    <div key={grand.guid} className="ml-4">
                      <button
                        onClick={() => selectCat(grand.guid)}
                        className={`w-full text-left px-2 py-1 rounded text-sm ${
                          isGrandSelected ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-slate-100 text-slate-500"
                        }`}
                      >
                        {grand.name}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    });
  }

  // ── Variant modal functions ────────────────────────────────────────────────

  async function openVariantModal(product: CatalogProduct) {
    setVariantProduct(product);
    setLoadingModal(true);
    setDrafts([]);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/products/${product.id}/variants`);
      if (res.ok) {
        const data = await res.json();
        setModalImages(data.images ?? []);
        setDrafts(
          (data.variants as Variant[]).map((v) => ({
            imageId: v.imageId,
            imageUrl: v.imageUrl,
            name: v.name,
          }))
        );
      }
    } finally {
      setLoadingModal(false);
    }
  }

  function toggleImageInDraft(img: ProductImage) {
    setDrafts((prev) => {
      const exists = prev.find((d) => d.imageId === img.id);
      if (exists) return prev.filter((d) => d.imageId !== img.id);
      return [...prev, { imageId: img.id, imageUrl: img.url, name: "" }];
    });
  }

  function updateDraftName(imageId: number, name: string) {
    setDrafts((prev) => prev.map((d) => (d.imageId === imageId ? { ...d, name } : d)));
  }

  async function saveVariants() {
    if (!variantProduct) return;
    const invalid = drafts.filter((d) => !d.name.trim());
    if (invalid.length > 0) {
      setSaveMsg("Заполните названия всех выбранных вариантов");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/products/${variantProduct.id}/variants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variants: drafts.map((d, i) => ({
            imageId: d.imageId,
            name: d.name.trim(),
            sortOrder: i,
          })),
        }),
      });
      if (res.ok) {
        setSaveMsg("Сохранено!");
        const count = drafts.length;
        setVariantCounts((prev) => ({ ...prev, [variantProduct.id]: count }));
        // Update hasVariants in search results
        setSearchResults((prev) =>
          prev.map((p) => p.id === variantProduct.id ? { ...p, hasVariants: count > 0 } : p)
        );
        setTimeout(() => {
          setSaveMsg("");
          setVariantProduct(null);
        }, 1200);
      } else {
        const data = await res.json();
        setSaveMsg(data.error || "Ошибка сохранения");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <a
          href="/admin/orders"
          className="flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-slate-50"
        >
          ←
        </a>
        <div>
          <h1 className="text-2xl font-black">Варианты товаров</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Отметьте какие фото соответствуют каким вариантам — клиент будет выбирать при оформлении заказа
          </p>
        </div>
      </div>

      {/* Open catalog button */}
      <button
        onClick={openCatalog}
        className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 px-6 py-4 text-blue-700 hover:bg-blue-100 hover:border-blue-400 transition-all w-full sm:w-auto"
      >
        <span className="text-2xl">🎨</span>
        <div className="text-left">
          <div className="font-bold">Выбрать товар из каталога</div>
          <div className="text-xs text-blue-500">Откроется каталог с категориями и поиском</div>
        </div>
      </button>

      {/* ── CATALOG MODAL ── */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
          <div className="flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <button
                onClick={() => setShowCatalog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
              >
                ✕
              </button>
              <h2 className="font-bold text-lg">Выберите товар для настройки вариантов</h2>
            </div>

            {/* Search bar */}
            <div className="border-b px-4 py-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleCatalogSearch(e.target.value)}
                placeholder="Поиск по названию или штрихкоду..."
                className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
              />
            </div>

            {/* Body: categories + products */}
            <div className="flex flex-1 overflow-hidden">
              {/* Categories sidebar */}
              <div className="w-56 flex-shrink-0 overflow-y-auto border-r bg-slate-50 p-3">
                <button
                  onClick={() => selectCat("")}
                  className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold ${
                    !selectedCatGuid ? "bg-blue-100 text-blue-700" : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  Все товары
                </button>
                <div className="space-y-0.5">{renderCatTree()}</div>
              </div>

              {/* Products grid */}
              <div
                className="flex-1 overflow-y-auto p-4"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
                    loadMore(searchQuery, selectedCatGuid);
                  }
                }}
              >
                {searchResults.length === 0 && !loadingMore && (
                  <div className="text-center text-slate-400 py-12">Ничего не найдено</div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {searchResults.map((p) => {
                    const imgUrl = getProductImageUrl(p.imagePath);
                    const hasV = p.hasVariants || (variantCounts[p.id] ?? 0) > 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setShowCatalog(false);
                          openVariantModal(p);
                        }}
                        className="group relative flex flex-col rounded-2xl border-2 overflow-hidden text-left transition-all hover:shadow-md border-slate-200 bg-white hover:border-blue-400"
                      >
                        {/* Image */}
                        <div className="relative aspect-square bg-slate-100 w-full">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt={p.name}
                              className="h-full w-full object-contain p-2"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-3xl">🧴</div>
                          )}
                          <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-blue-600/80 text-white font-bold text-xs px-2 text-center">
                            Настроить варианты
                          </div>
                        </div>
                        {/* Info */}
                        <div className="p-2 flex-1">
                          <p className="text-xs font-semibold leading-snug line-clamp-2">{p.name}</p>
                          {hasV ? (
                            <p className="text-xs text-green-600 font-semibold mt-0.5">✓ Варианты настроены</p>
                          ) : (
                            <p className="text-xs text-slate-400 mt-0.5">Без вариантов</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {loadingMore && (
                  <div className="py-6 text-center text-slate-400 text-sm">Загрузка...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VARIANT MODAL ── */}
      {variantProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <button
                onClick={() => { setVariantProduct(null); setShowCatalog(true); }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
                title="Вернуться к каталогу"
              >
                ←
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-base leading-tight truncate">{variantProduct.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Выберите фото для вариантов и укажите название каждого
                </p>
              </div>
              <button
                onClick={() => setVariantProduct(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingModal ? (
                <div className="text-center text-slate-400 py-12">Загрузка...</div>
              ) : modalImages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📷</div>
                  <div className="text-slate-500 font-semibold">У этого товара нет фото</div>
                  <div className="text-xs text-slate-400 mt-1">Фото загружаются через синхронизацию с 1С</div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-4">
                    Кликните на фото чтобы отметить его как вариант, затем введите название.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {modalImages.map((img) => {
                      const draft = drafts.find((d) => d.imageId === img.id);
                      const isSelected = !!draft;
                      return (
                        <div
                          key={img.id}
                          className={`rounded-2xl border-2 overflow-hidden transition-all ${
                            isSelected ? "border-blue-500 shadow-md" : "border-slate-200"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleImageInDraft(img)}
                            className="w-full aspect-square relative bg-slate-50"
                          >
                            <img
                              src={img.url}
                              alt=""
                              className="h-full w-full object-contain p-2"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                ✓
                              </div>
                            )}
                            {!isSelected && (
                              <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-blue-600/30" />
                            )}
                          </button>
                          {isSelected && (
                            <div className="px-2 pb-2 pt-1">
                              <input
                                type="text"
                                value={draft.name}
                                onChange={(e) => updateDraftName(img.id, e.target.value)}
                                placeholder="Название варианта..."
                                className="w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {drafts.length > 0 && (
                    <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                      Выбрано вариантов: <strong>{drafts.length}</strong> —{" "}
                      {drafts.map((d) => d.name || "без названия").join(", ")}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!loadingModal && modalImages.length > 0 && (
              <div className="border-t px-5 py-4 flex items-center justify-between gap-3">
                <div className="text-sm">
                  {saveMsg && (
                    <span className={saveMsg === "Сохранено!" ? "text-green-600 font-semibold" : "text-red-600"}>
                      {saveMsg}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setVariantProduct(null); setShowCatalog(true); }}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    ← Назад
                  </button>
                  <button
                    onClick={saveVariants}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
