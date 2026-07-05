"use client";

import { useState, useCallback } from "react";

type Product = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  imageUrl: string | null;
  imageCount: number;
  variantCount: number;
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
  sortOrder: number;
};

// Draft variant (before saving)
type DraftVariant = {
  imageId: number;
  imageUrl: string;
  name: string;
};

export default function AdminProductsClient() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Variant modal
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalImages, setModalImages] = useState<ProductImage[]>([]);
  const [modalVariants, setModalVariants] = useState<Variant[]>([]);
  const [drafts, setDrafts] = useState<DraftVariant[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  async function search(q: string) {
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch(`/api/admin/products?q=${encodeURIComponent(q)}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  async function openVariantModal(product: Product) {
    setModalProduct(product);
    setLoadingModal(true);
    setDrafts([]);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/products/${product.id}/variants`);
      if (res.ok) {
        const data = await res.json();
        setModalImages(data.images ?? []);
        setModalVariants(data.variants ?? []);
        // Pre-fill drafts from existing variants
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
      if (exists) {
        return prev.filter((d) => d.imageId !== img.id);
      }
      return [...prev, { imageId: img.id, imageUrl: img.url, name: "" }];
    });
  }

  function updateDraftName(imageId: number, name: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.imageId === imageId ? { ...d, name } : d))
    );
  }

  async function saveVariants() {
    if (!modalProduct) return;
    const invalid = drafts.filter((d) => !d.name.trim());
    if (invalid.length > 0) {
      setSaveMsg("Заполните названия всех выбранных вариантов");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/products/${modalProduct.id}/variants`, {
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
        const data = await res.json();
        setModalVariants(data.variants ?? []);
        setSaveMsg("Сохранено!");
        // Update product list count
        setProducts((prev) =>
          prev.map((p) =>
            p.id === modalProduct.id
              ? { ...p, variantCount: drafts.length }
              : p
          )
        );
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        const data = await res.json();
        setSaveMsg(data.error || "Ошибка сохранения");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <a
          href="/admin/orders"
          className="flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-slate-50"
        >
          ←
        </a>
        <h1 className="text-2xl font-black">Варианты товаров</h1>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        Найдите товар и укажите, какие фото соответствуют каким вариантам. Клиент будет выбирать вариант по фото при добавлении товара в заказ.
      </p>

      {/* Search */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(query)}
          placeholder="Название, штрихкод или артикул..."
          className="flex-1 rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={() => search(query)}
          disabled={searching}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {searching ? "..." : "Найти"}
        </button>
      </div>

      {/* Results */}
      {searched && products.length === 0 && (
        <div className="text-center text-slate-400 py-8">Ничего не найдено</div>
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-4 rounded-2xl border bg-white p-3"
          >
            {p.imageUrl ? (
              <img
                src={p.imageUrl}
                alt={p.name}
                className="h-14 w-14 rounded-xl object-contain border bg-slate-50 p-1 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="h-14 w-14 rounded-xl border bg-slate-100 flex items-center justify-center text-2xl shrink-0">
                🧴
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-snug truncate">{p.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {p.imageCount} фото
                {p.variantCount > 0 && (
                  <span className="ml-2 text-green-600 font-semibold">
                    · {p.variantCount} вариант{p.variantCount === 1 ? "" : p.variantCount < 5 ? "а" : "ов"}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => openVariantModal(p)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                p.variantCount > 0
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "border hover:bg-slate-50 text-slate-600"
              }`}
            >
              {p.variantCount > 0 ? "✓ Варианты" : "Добавить варианты"}
            </button>
          </div>
        ))}
      </div>

      {/* Variant modal */}
      {modalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <button
                onClick={() => setModalProduct(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border hover:bg-slate-100"
              >
                ✕
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-base leading-tight truncate">
                  {modalProduct.name}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Выберите фото для вариантов и укажите название каждого
                </p>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingModal ? (
                <div className="text-center text-slate-400 py-12">Загрузка...</div>
              ) : modalImages.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  У этого товара нет загруженных фото.<br />
                  <span className="text-xs">Фото загружаются через синхронизацию с 1С.</span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-4">
                    Кликните на фото чтобы отметить его как вариант. Введите название варианта под фото.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {modalImages.map((img) => {
                      const draft = drafts.find((d) => d.imageId === img.id);
                      const isSelected = !!draft;
                      return (
                        <div
                          key={img.id}
                          className={`rounded-2xl border-2 overflow-hidden transition-all ${
                            isSelected
                              ? "border-blue-500 shadow-md"
                              : "border-slate-200"
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

            {/* Modal footer */}
            {!loadingModal && modalImages.length > 0 && (
              <div className="border-t px-5 py-4 flex items-center justify-between gap-3">
                <div className="text-sm">
                  {saveMsg && (
                    <span className={saveMsg === "Сохранено!" ? "text-green-600 font-semibold" : "text-red-600"}>
                      {saveMsg}
                    </span>
                  )}
                  {drafts.length === 0 && !saveMsg && (
                    <span className="text-slate-400">Выберите фото для вариантов</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalProduct(null)}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Закрыть
                  </button>
                  <button
                    onClick={saveVariants}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Сохранение..." : "Сохранить варианты"}
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
