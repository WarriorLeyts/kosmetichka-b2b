import { CARD_PRODUCT_NAME } from "@/lib/cardPurchase";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { brandVisibilityWhere, readHiddenBrands, productExcluded } from "@/scripts/catalog-visibility.js";
export { HIDDEN_BRAND_PREFIX, ANGIOPHARM_ID, angiopharmWhere, isAngiopharm } from "@/scripts/catalog-visibility.js";
let memo: { at: number; ids: string[] } | null = null;
let generation = 0;
let loading: Promise<string[]> | null = null;
export function invalidateBrandVisibility() { memo = null; loading = null; generation++; }
export async function hiddenBrandIds(): Promise<string[]> {
  if (memo && Date.now() - memo.at < 5000) return memo.ids;
  if (loading) return loading;
  const version = generation;
  const task = (async () => {
    const ids: string[] = await readHiddenBrands(prisma); // Failed reads never expose excluded products.
    if (version !== generation) return hiddenBrandIds();
    memo = { at: Date.now(), ids };
    return ids;
  })();
  loading = task;
  try { return await task; }
  finally { if (loading === task) loading = null; }
}
export async function visibleBrandsWhere(): Promise<Prisma.ProductWhereInput> {
  return brandVisibilityWhere(await hiddenBrandIds()) as Prisma.ProductWhereInput;
}
export async function brandProductExcluded(product: { name: string; brandGuid: string | null; brand?: { name: string } | null }): Promise<boolean> {
  return productExcluded(product, await hiddenBrandIds());
}

/** Do not trust old JSON snapshots: the current database product decides brand visibility. */
export async function filterVisibleSnapshots<T extends Record<string, unknown>>(items: T[]): Promise<T[]> {
  if (!items.length) return items;
  const hidden = await hiddenBrandIds();
  const ids = [...new Set(items.map(i => Number(i.id)).filter(id => Number.isInteger(id) && id > 0))];
  const blocked = await prisma.product.findMany({ where: { id: { in: ids }, OR: [{ images: { none: { path: { not: "" } } }, NOT: process.env.LOYALTY_CARD_PRODUCT_GUID ? { guid: process.env.LOYALTY_CARD_PRODUCT_GUID } : { name: { equals: CARD_PRODUCT_NAME, mode: "insensitive" } } }, ...(hidden.length ? [{ NOT: brandVisibilityWhere(hidden) as Prisma.ProductWhereInput }] : [])] }, select: { id: true } });
  const excluded = new Set(blocked.map(p => p.id));
  return items.filter(i => !excluded.has(Number(i.id)));
}
