"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, GitCompareArrows, ShoppingCart } from "lucide-react";
import { useCompareStore, type CompareProduct } from "@/store/compareStore";
import { SafeImage } from "@/components/catalog/SafeImage";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import {
  effectivePriceType,
  priceFor,
  type PriceType,
} from "@/lib/pricing";
import { getStockLabel } from "@/lib/utils";

// ── Comparison rows config ───────────────────────────────────────────────────

type RowKey =
  | "brand"
  | "category"
  | "price"
  | "stock"
  | "description"
  | "article"
  | "barcode"
  | "minOrderQty";

const ROWS: { key: RowKey; label: string }[] = [
  { key: "brand", label: "Бренд" },
  { key: "category", label: "Категория" },
  { key: "price", label: "Цена" },
  { key: "stock", label: "Наличие" },
  { key: "description", label: "Состав / описание" },
  { key: "article", label: "Артикул" },
  { key: "barcode", label: "Штрих-код" },
  { key: "minOrderQty", label: "Мин. заказ" },
];

function getCellValue(
  key: RowKey,
  product: CompareProduct,
  priceType: PriceType
): React.ReactNode {
  switch (key) {
    case "brand":
      return product.brandName || <span className="text-slate-300">—</span>;
    case "category":
      return product.categoryName || <span className="text-slate-300">—</span>;
    case "price": {
      // Build price tiers using the same fallback logic as priceFor()
      const tiers = [
        {
          label: "Розница",
          key: "retail" as PriceType,
          value: Number(product.retailPrice ?? 0),
        },
        {
          label: "Скидка",
          key: "discount" as PriceType,
          value: Number(product.discountPrice ?? product.retailPrice ?? 0),
        },
        {
          label: "Опт",
          key: "wholesale" as PriceType,
          value: Number(product.wholesalePrice ?? 0),
        },
        {
          label: "Кр. опт",
          key: "big_wholesale" as PriceType,
          value: Number(
            product.bigWholesalePrice ?? product.wholesalePrice ?? 0
          ),
        },
      ].filter((t) => t.value > 0);

      // Active price determined by priceFor() — handles all fallbacks correctly
      const activeValue = priceFor(product, priceType);

      if (tiers.length === 0)
        return <span className="text-slate-300">—</span>;

      return (
        <div className="space-y-1">
          {tiers.map((t) => {
            const isActive = t.value === activeValue && t.key === priceType;
            return (
              <div
                key={t.key}
                className={`flex items-center justify-between gap-2 text-sm ${
                  isActive ? "font-black text-indigo-600" : "text-slate-500"
                }`}
              >
                <span>{t.label}:</span>
                <span>{t.value.toLocaleString("ru-RU")} ₽</span>
              </div>
            );
          })}
        </div>
      );
    }
    case "stock": {
      const s = getStockLabel(product.stock);
      return (
        <span className={`text-sm font-semibold ${s.className}`}>
          {s.text}
        </span>
      );
    }
    case "description":
      return product.description ? (
        <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-6">
          {product.description}
        </p>
      ) : (
        <span className="text-slate-300 text-sm">Не указано</span>
      );
    case "article":
      return product.article || <span className="text-slate-300">—</span>;
    case "barcode":
      return product.barcode || <span className="text-slate-300">—</span>;
    case "minOrderQty":
      return (
        <span className={product.minOrderQty > 1 ? "font-semibold text-indigo-600" : ""}>
          {product.minOrderQty} шт.
        </span>
      );
    default:
      return <span className="text-slate-300">—</span>;
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const items = useCompareStore((s) => s.items);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const addToCart = useCartStore((s) => s.addToCart);
  const cartItems = useCartStore((s) => s.cart);
  const customer = useAuthStore((s) => s.customer);
  const fetchCustomer = useAuthStore((s) => s.fetchCustomer);

  // SSR hydration guard + load customer so price tier is correct
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    fetchCustomer();
  }, [fetchCustomer]);

  const activePriceType = effectivePriceType(cartItems, customer);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl">
          <div className="h-8 w-48 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            href="/catalog"
            className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-50 text-slate-600"
          >
            ←
          </Link>
          <GitCompareArrows size={20} className="text-indigo-500" />
          <h1 className="text-xl font-black text-slate-900">
            Сравнение товаров
          </h1>
          {items.length > 0 && (
            <button
              onClick={clear}
              className="ml-auto text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Очистить всё
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <GitCompareArrows size={48} className="text-slate-200" />
            <p className="text-lg font-semibold text-slate-400">
              Нет товаров для сравнения
            </p>
            <p className="text-sm text-slate-400">
              Нажмите ⚖ на карточке товара, чтобы добавить в сравнение
            </p>
            <Link
              href="/catalog"
              className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
            >
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 400 + items.length * 220 }}>
              {/* Product header row */}
              <thead>
                <tr>
                  {/* Label column */}
                  <th className="w-36 min-w-[144px] border-b border-r border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-500" />

                  {items.map((product) => (
                    <th
                      key={product.id}
                      className="min-w-[200px] border-b border-r border-slate-200 bg-white p-3 text-left align-top last:border-r-0"
                    >
                      <div className="relative">
                        {/* Remove button */}
                        <button
                          onClick={() => remove(product.id)}
                          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                          title="Убрать из сравнения"
                        >
                          <X size={13} />
                        </button>

                        {/* Product image */}
                        <Link href={`/product/${product.id}`}>
                          <div className="mx-auto mb-3 h-32 w-32 overflow-hidden rounded-xl border bg-slate-50">
                            <SafeImage
                              src={product.imagePath}
                              alt={product.name}
                              placeholderIconSize={24}
                            />
                          </div>
                        </Link>

                        {/* Product name */}
                        <Link
                          href={`/product/${product.id}`}
                          className="block text-sm font-bold text-slate-800 hover:text-indigo-600 transition-colors line-clamp-3 leading-snug"
                        >
                          {product.name}
                        </Link>

                        {/* Add to cart */}
                        {(product.stock ?? 0) > 0 && (
                          <button
                            onClick={() =>
                              addToCart({
                                id: product.id,
                                name: product.name,
                                images: product.imagePath
                                  ? [{ path: product.imagePath }]
                                  : [],
                                retailPrice: product.retailPrice,
                                discountPrice: product.discountPrice,
                                wholesalePrice: product.wholesalePrice,
                                bigWholesalePrice: product.bigWholesalePrice,
                                stock: product.stock,
                                minOrderQty: product.minOrderQty,
                              })
                            }
                            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
                          >
                            <ShoppingCart size={13} />
                            В корзину
                          </button>
                        )}
                      </div>
                    </th>
                  ))}

                  {/* Placeholder columns for empty slots */}
                  {Array.from({ length: 3 - items.length }).map((_, i) => (
                    <th
                      key={`ph-${i}`}
                      className="min-w-[200px] border-b border-r border-slate-200 bg-slate-50/50 p-3 last:border-r-0"
                    >
                      <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-slate-200">
                        <Link
                          href="/catalog"
                          className="text-center text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                        >
                          + Добавить
                          <br />
                          товар
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Comparison rows */}
              <tbody>
                {ROWS.map((row, rowIdx) => (
                  <tr
                    key={row.key}
                    className={rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                  >
                    {/* Row label */}
                    <td className="border-r border-slate-200 p-3 align-top">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        {row.label}
                      </span>
                    </td>

                    {/* Product values */}
                    {items.map((product) => (
                      <td
                        key={product.id}
                        className="border-r border-slate-200 p-3 align-top last:border-r-0"
                      >
                        {getCellValue(row.key, product, activePriceType)}
                      </td>
                    ))}

                    {/* Empty placeholders */}
                    {Array.from({ length: 3 - items.length }).map((_, i) => (
                      <td
                        key={`ph-${i}`}
                        className="border-r border-slate-200 p-3 last:border-r-0"
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
