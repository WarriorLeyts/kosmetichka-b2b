"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";

type WishlistProduct = {
  id: number;
  name: string;
  barcode: string | null;
  article: string | null;
  stock: number | null;
  images: { path: string }[];
  prices: { priceType: string; price: number }[];
  brand: { name: string } | null;
};

type WishlistItem = {
  id: number;
  productId: number;
  notified: boolean;
  createdAt: Date | string;
  product: WishlistProduct;
};

function resolveImageUrl(p: string) {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return "/1c/" + p;
}

function getPrice(prices: { priceType: string; price: number }[], type = "wholesale") {
  return prices.find((p) => p.priceType === type)?.price ?? prices[0]?.price ?? 0;
}

export function WishlistPageClient({ items: initialItems }: { items: WishlistItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [removing, setRemoving] = useState<number | null>(null);

  async function handleRemove(productId: number) {
    setRemoving(productId);
    await fetch(`/api/wishlist?productId=${productId}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.productId !== productId));
    setRemoving(null);
  }

  // Mark items as "notified" when shown as back-in-stock for the first time
  // so the badge doesn't re-appear on every visit.
  useEffect(() => {
    const toNotify = items.filter(
      (i) => (i.product.stock ?? 0) > 0 && !i.notified
    );
    if (toNotify.length === 0) return;

    // Mark in local state immediately
    setItems((prev) =>
      prev.map((i) =>
        toNotify.some((n) => n.id === i.id) ? { ...i, notified: true } : i
      )
    );

    // Persist to server (fire-and-forget)
    toNotify.forEach((i) => {
      fetch("/api/wishlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: i.productId, notified: true }),
      }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
        <div className="mb-3 text-4xl">🔔</div>
        <p className="text-base font-bold text-slate-700">Все товары убраны из листа</p>
        <Link
          href="/catalog"
          className="mt-5 inline-block rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-2.5 text-sm font-black text-white hover:opacity-90 transition"
        >
          В каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const { product } = item;
        const imageUrl = product.images[0] ? resolveImageUrl(product.images[0].path) : null;
        const price = getPrice(product.prices);
        const inStock = (product.stock ?? 0) > 0;
        // "Появился в наличии!" only when stock appeared AFTER item was added
        // (notified=false means we haven't shown this badge yet for this restock event)
        const isNewlyInStock = inStock && !item.notified;

        return (
          <div
            key={item.id}
            className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm"
          >
            {/* Image */}
            <Link href={`/product/${product.id}`} className="flex-shrink-0">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={product.name}
                  className="h-20 w-20 rounded-xl border object-contain bg-slate-50"
                  onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
                />
              ) : (
                <div className="h-20 w-20 rounded-xl border bg-slate-100 flex items-center justify-center text-2xl">
                  🧴
                </div>
              )}
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <Link href={`/product/${product.id}`}>
                <p className="line-clamp-2 text-sm font-bold text-slate-800 hover:text-indigo-600 transition">
                  {product.name}
                </p>
              </Link>
              {product.brand?.name && (
                <p className="mt-0.5 text-xs text-slate-400">{product.brand.name}</p>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {price > 0 && (
                  <span className="text-base font-black text-slate-900">
                    {price.toLocaleString("ru-RU")} ₽
                  </span>
                )}
                {isNewlyInStock ? (
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-600 animate-pulse">
                    🎉 Появился в наличии!
                  </span>
                ) : inStock ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                    В наличии
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-500">
                    <Bell size={10} />
                    Ожидаем
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {inStock && (
                <Link
                  href={`/product/${product.id}`}
                  className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-3 py-1.5 text-xs font-black text-white hover:opacity-90 transition"
                >
                  Купить
                </Link>
              )}
              <button
                onClick={() => handleRemove(product.id)}
                disabled={removing === product.id}
                className="flex h-8 w-8 items-center justify-center rounded-xl border text-slate-400 hover:bg-red-50 hover:text-red-500 transition disabled:opacity-40"
                title="Убрать из листа ожидания"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
