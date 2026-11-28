import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { brandVisibilityWhere, readHiddenBrands, productExcluded } from "@/scripts/catalog-visibility.js";
export { HIDDEN_BRAND_PREFIX, ANGIOPHARM_ID, angiopharmWhere, isAngiopharm } from "@/scripts/catalog-visibility.js";
let memo: { at: number; ids: string[] } | null = null;
let generation = 0;
export function invalidateBrandVisibility() { memo = null; generation++; }
export async function hiddenBrandIds(): Promise<string[]> {
  if (memo && Date.now() - memo.at < 5000) return memo.ids;
  const version = generation;
  const ids: string[] = await readHiddenBrands(prisma); // A failed read must never expose excluded products.
  if (version !== generation) return hiddenBrandIds();
  memo = { at: Date.now(), ids };
  return ids;
}
export async function visibleBrandsWhere(): Promise<Prisma.ProductWhereInput> {
  return brandVisibilityWhere(await hiddenBrandIds()) as Prisma.ProductWhereInput;
}
export async function brandProductExcluded(product: { name: string; brandGuid: string | null; brand?: { name: string } | null }): Promise<boolean> {
  return productExcluded(product, await hiddenBrandIds());
}
