import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { promotionalPrice } from "./pricing";

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

  const special = (type: string) => product.prices?.find((p) => p.priceType === type)?.price ?? null;
  const regularPrices = { retailPrice, wholesalePrice, bigWholesalePrice, discountPrice };
  const flat = { ...product, ...regularPrices, regularPrices,
    promoRetailPrice: special("promo_retail"),
    promoWholesalePrice: special("promo_wholesale"),
    promoBigWholesalePrice: special("promo_big_wholesale"),
  };
  // Keep the existing API fields useful to older apps as well as the site's priceFor().
  const now = Date.now();
  return { ...flat, retailPrice: promotionalPrice(flat, "retail", now) ?? retailPrice,
    discountPrice: promotionalPrice(flat, "discount", now) ?? discountPrice,
    wholesalePrice: promotionalPrice(flat, "wholesale", now) ?? wholesalePrice,
    bigWholesalePrice: promotionalPrice(flat, "big_wholesale", now) ?? bigWholesalePrice };
}

/** New promotional fields and the regular-price snapshot must follow the guest price mask too. */
export function maskWholesalePrices(product: any) {
  const { wholesalePrice: _w, bigWholesalePrice: _b, promoWholesalePrice: _pw,
    promoBigWholesalePrice: _pb, prices: _p, regularPrices, ...rest } = product;
  return { ...rest, prices: [], ...(regularPrices ? { regularPrices: {
    retailPrice: regularPrices.retailPrice, discountPrice: regularPrices.discountPrice,
  } } : {}) };
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

/**
 * Stock as a guest sees it: the exact number told competitors how much the shop has. The apps
 * only show «Нет в наличии / Осталось мало / Больше 10 шт.», and these values give the same labels;
 * 10 for «мало» never limits a guest's cart below the real stock (which is at most 10 there).
 */
/**
 * Wholesale customers (owner's rule, 2026-11-09): the shop «1. Мега Косметичка» keeps at least this many
 * of each product on its shelves; the warehouse «0. Склад» gives everything. What a wholesaler may order
 * is Product.wholesaleStock = (shop − 12, not below 0) + warehouse, counted by the 1С import
 * (scripts/onec-helpers.js wholesaleAvailable). Staff and retail see the real stock.
 */
export const WHOLESALE_MIN_STOCK = 12;

export function isWholesaleType(priceType: string | null | undefined): boolean {
  return priceType === "wholesale" || priceType === "big_wholesale";
}

/** The stock a customer of this price type sees: a wholesaler — what he may order (Product.wholesaleStock). */
export function customerStock(stock: number | null | undefined, priceType: string | null | undefined, wholesaleStock: number | null | undefined): number | null | undefined {
  if (!isWholesaleType(priceType)) return stock;
  return Math.max(0, Number(wholesaleStock ?? 0));
}

export function guestStock(stock: number | null | undefined): number {
  const v = Number(stock ?? 0);
  if (!(v > 0)) return 0;
  return v > 10 ? 9999 : 10;
}

