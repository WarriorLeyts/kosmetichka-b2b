import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { angiopharmWhere, brandVisibilityWhere, HIDDEN_BRAND_PREFIX, isAngiopharm, productExcluded } from "../scripts/catalog-visibility.js";
const db = vi.hoisted(() => ({ cmsSetting: { findMany: vi.fn() }, product: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { hiddenBrandIds, invalidateBrandVisibility, visibleBrandsWhere, filterVisibleSnapshots } from "./brandVisibility";

// The policy's Prisma predicate has only AND/OR/NOT, nullable brand relations, and contains/in.
function matches(p: { name: string; brand?: { guid: string; name: string } | null }, w: Prisma.ProductWhereInput): boolean {
  if (w.AND) return (Array.isArray(w.AND) ? w.AND : [w.AND]).every(q => matches(p, q));
  if (w.OR) return w.OR.some(q => matches(p, q));
  if (w.NOT) return !(Array.isArray(w.NOT) ? w.NOT : [w.NOT]).some(q => matches(p, q));
  if (w.brand && "is" in w.brand) {
    const b = w.brand.is as { name?: { contains: string }; guid?: { in: string[] } };
    return !!p.brand && (b.guid ? b.guid.in.includes(p.brand.guid) : p.brand.name.toLowerCase().includes(b.name!.contains));
  }
  if (w.name && typeof w.name === "object" && w.name.contains) return p.name.toLowerCase().includes(String(w.name.contains));
  return true;
}

beforeEach(() => { invalidateBrandVisibility(); vi.resetAllMocks(); db.cmsSetting.findMany.mockResolvedValue([]); });

describe("persistent brand exclusions", () => {
  it("finds Angiopharm by product name OR brand, regardless of casing and normal separators", () => {
    const products = [
      { name: "Крем АНГИОФАРМ", brandGuid: null, brand: null },
      { name: "Сыворотка", brandGuid: "new-from-1c", brand: { guid: "new-from-1c", name: "Angiopharm" } },
      { name: "Крем Angio-Pharm", brandGuid: "other", brand: { guid: "other", name: "Другое" } },
      { name: "Крем", brandGuid: null, brand: null },
    ];
    expect(products.map(p => matches(p, angiopharmWhere() as Prisma.ProductWhereInput))).toEqual([true, true, true, false]);
    expect(products.map(p => productExcluded(p, ["angiopharm"]))).toEqual([true, true, true, false]);
    expect(products.map(p => matches(p, brandVisibilityWhere(["angiopharm"]) as Prisma.ProductWhereInput))).toEqual([false, false, false, true]);
    expect(isAngiopharm("Ангио Фарм")).toBe(true);
  });
  it("blocks future imports of a chosen brand, keeps brandless/unrelated products, and restores without changing individual hidden flags", () => {
    const p = { name: "Новый крем", brandGuid: "brand-a", brand: { guid: "brand-a", name: "A" }, hidden: false };
    expect(matches(p, brandVisibilityWhere(["brand-a"]) as Prisma.ProductWhereInput)).toBe(false);
    expect(matches({ name: "Без бренда", brand: null }, brandVisibilityWhere(["brand-a"]) as Prisma.ProductWhereInput)).toBe(true);
    expect(matches(p, brandVisibilityWhere([]) as Prisma.ProductWhereInput)).toBe(true);
    expect(p.hidden).toBe(false);
  });
  it("reads persisted keys, caches briefly, and refreshes immediately after admin changes", async () => {
    db.cmsSetting.findMany.mockResolvedValue([{ key: HIDDEN_BRAND_PREFIX + "angiopharm" }]);
    expect(await hiddenBrandIds()).toEqual(["angiopharm"]);
    await visibleBrandsWhere(); expect(db.cmsSetting.findMany).toHaveBeenCalledTimes(1);
    db.cmsSetting.findMany.mockResolvedValue([]); invalidateBrandVisibility();
    expect(await visibleBrandsWhere()).toEqual({});
  });
  it("fails closed on database failures instead of exposing blocked products", async () => {
    db.cmsSetting.findMany.mockRejectedValue(new Error("DB unavailable"));
    await expect(visibleBrandsWhere()).rejects.toThrow("DB unavailable");
  });
});

it("filters saved products using database IDs even when a snapshot has a fake brand/name", async () => {
  db.cmsSetting.findMany.mockResolvedValue([{ key: HIDDEN_BRAND_PREFIX + "angiopharm" }]);
  db.product.findMany.mockResolvedValue([{ id: 42 }]);
  const old = [{ id: 42, name: "Другое", brand: { name: "CELIMAX" } }, { id: 43, name: "Обычный крем" }];
  expect(await filterVisibleSnapshots(old)).toEqual([old[1]]);
  expect(old).toHaveLength(2); // GET never rewrites a customer's saved lists.
  expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [42, 43] }, NOT: expect.any(Object) }) }));
});
