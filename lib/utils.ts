import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Products from Prisma only carry a `prices` relation
 * (priceType/price pairs from 1C). The UI reads flat
 * `retailPrice` / `wholesalePrice` fields, so this maps
 * the relation onto those fields before sending data to
 * client components.
 */
export function withFlatPrices<
  T extends { prices?: { priceType: string; price: number }[] }
>(product: T) {
  const retailPrice =
    product.prices?.find((p) => p.priceType === "retail")?.price ?? 0;
  const wholesalePrice =
    product.prices?.find((p) => p.priceType === "wholesale")?.price ?? 0;
  const bigWholesalePrice =
    product.prices?.find((p) => p.priceType === "big_wholesale")?.price ?? null;
  const discountPrice =
    product.prices?.find((p) => p.priceType === "discount")?.price ?? null;

  return { ...product, retailPrice, wholesalePrice, bigWholesalePrice, discountPrice };
}

/**
 * Customers shouldn't see the exact warehouse remainder — just a coarse
 * availability signal.
 */
export function getStockLabel(stock: number | null | undefined) {
  const value = stock ?? 0;

  if (value <= 0) {
    return { text: "Нет в наличии", className: "stock-out" };
  }

  if (value > 10) {
    return { text: "Больше 10 шт.", className: "stock-high" };
  }

  return { text: "Осталось мало", className: "stock-low" };
}
