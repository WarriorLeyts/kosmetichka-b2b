/**
 * Shared domain types used across stores, components, and lib utilities.
 * Keep this file free of React / Next.js imports so it can be used anywhere.
 */

// ── Product ──────────────────────────────────────────────────────────────────

/** Raw price row from the DB (before flattening). */
export type ProductPrice = {
  priceType: string;
  price: number;
};

/** Product image as returned by the API. */
export type ProductImage = {
  path: string;
};

/** A product as returned by withFlatPrices() — all four price tiers are
 *  denormalised onto the object, nullish when not configured in the DB. */
export type FlatProduct = {
  id: number;
  guid?: string;
  name: string;
  barcode?: string | null;
  article?: string | null;
  description?: string | null;
  stock?: number | null;
  minOrderQty?: number;

  // Denormalised price tiers (added by withFlatPrices)
  retailPrice?: number | null;
  discountPrice?: number | null;
  wholesalePrice?: number | null;
  bigWholesalePrice?: number | null;

  images?: ProductImage[];
  prices?: ProductPrice[];

  category?: { guid: string; name: string } | null;
  brand?: { guid: string; name: string } | null;

  createdAt?: string;
  updatedAt?: string;
};

// ── Cart ─────────────────────────────────────────────────────────────────────

/** A product entry in the cart: FlatProduct + cart-specific metadata. */
export type CartItem = FlatProduct & {
  quantity: number;
  /** Unique key within the cart: `"${productId}"` or `"${productId}_v${variantId}"` */
  cartKey: string;
  variantId?: number;
  variantName?: string | null;
  variantImageUrl?: string | null;
};

/** Payload passed to repeatOrder() — comes from a past order's items. */
export type RepeatOrderItem = {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  barcode?: string | null;
  variantId?: number | null;
  variantName?: string | null;
  variantImageUrl?: string | null;
  imagePath?: string | null;
};

// ── Customer (auth) ──────────────────────────────────────────────────────────

/** Minimal customer shape used for pricing resolution. */
export type CustomerForPricing = {
  priceType?: string | null;
};

/** Full authenticated customer as stored in authStore. */
export type AuthCustomer = CustomerForPricing & {
  id: number;
  name?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  city?: string | null;
  address?: string | null;
  manager?: string | null;
  isApproved?: boolean;
};
