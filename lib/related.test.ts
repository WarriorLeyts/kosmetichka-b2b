import { describe, expect, it, vi } from "vitest";

const products: Record<number, { id: number; brandGuid: string | null; categoryGuid: string | null; prices: { priceType: string; price: number }[]; stock: number; relatedIds?: number[]; hidden?: boolean }> = {
  1: { id: 1, brandGuid: "fino", categoryGuid: "shampoo", prices: [{ priceType: "retail", price: 1000 }], stock: 5 },
  2: { id: 2, brandGuid: "other", categoryGuid: "shampoo", prices: [{ priceType: "retail", price: 1050 }], stock: 5 },
  3: { id: 3, brandGuid: "fino", categoryGuid: "shampoo", prices: [{ priceType: "retail", price: 3000 }], stock: 5 },
  4: { id: 4, brandGuid: "other", categoryGuid: "shampoo", prices: [{ priceType: "retail", price: 400 }], stock: 5 },
  5: { id: 5, brandGuid: "fino", categoryGuid: "mask", prices: [{ priceType: "retail", price: 900 }], stock: 5 },
  6: { id: 6, brandGuid: "x", categoryGuid: "cream", prices: [], stock: 0 },
  7: { id: 7, brandGuid: "x", categoryGuid: "cream", prices: [], stock: 3 },
  // «Сопутствующие» из админ-панели: 4 — первым, 6 — нет в наличии, 3 — скрыт
  8: { id: 8, brandGuid: "solo", categoryGuid: "solo", prices: [], stock: 5, relatedIds: [4, 6, 3] },
};
products[3].hidden = true;
const list = Object.values(products);
const match = (p: (typeof list)[number], w: any): boolean => {
  if (!w) return true;
  if (w.id?.in && !w.id.in.includes(p.id)) return false;
  if (w.id?.not !== undefined && p.id === w.id.not) return false;
  if (w.id?.notIn && w.id.notIn.includes(p.id)) return false;
  if (w.categoryGuid && p.categoryGuid !== w.categoryGuid) return false;
  if (w.brandGuid && p.brandGuid !== w.brandGuid) return false;
  if (w.NOT?.categoryGuid && p.categoryGuid === w.NOT.categoryGuid) return false;
  if (w.stock?.gt !== undefined && !(p.stock > w.stock.gt)) return false;
  if (w.hidden === false && p.hidden) return false;
  return true;
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(async ({ where }: any) => products[where.id] ?? null),
      findMany: vi.fn(async ({ where }: any) => list.filter((p) => match(p, where))),
    },
    $queryRaw: vi.fn(async () => [{ productId: 6, n: 4 }, { productId: 7, n: 3 }]),
  },
}));

import { relatedIds } from "./related";

describe("under a product: «С этим берут» / «Похожие»", () => {
  it("similar: same category, the same brand first, then the closest price", async () => {
    // 3 скрыт в админ-панели — не показывается
    expect(await relatedIds(1, "similar", false)).toEqual([2, 4]);
  });
  it("together: bought in the same orders (in stock only), then the brand from other categories", async () => {
    expect(await relatedIds(1, "together", false)).toEqual([7, 5]);
  });
  it("together: the products chosen in the admin panel go first (in stock, not hidden)", async () => {
    expect((await relatedIds(8, "together", false)).slice(0, 2)).toEqual([4, 7]);
  });
});
