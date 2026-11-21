import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORIGINAL_PERFUME_CATEGORY as ORIGINAL, originalPerfumeCategories, refreshWholesaleStock, shopReserve } from "../scripts/wholesale-stock-policy.js";
import { wholesaleAvailable } from "../scripts/onec-helpers.js";

const db = vi.hoisted(() => ({
  category: { findMany: vi.fn() }, product: { findMany: vi.fn(), updateMany: vi.fn() },
  productWarehouseStock: { findMany: vi.fn() },
}));
vi.mock("./prisma", () => ({ prisma: db }));
import { orderSplits, SHOP_WAREHOUSE as SHOP, STOCK_WAREHOUSE as STOCK, toWarehouseQty } from "./orderWarehouses";
const categories = [{ guid: ORIGINAL, name: "Парфюм оригинал", parentGuid: "perfume" }, { guid: "child", name: "Миниатюры", parentGuid: ORIGINAL }, { guid: "copy", name: "Парфюм Копия", parentGuid: "perfume" }];
beforeEach(() => {
  vi.resetAllMocks();
  db.category.findMany.mockResolvedValue(categories);
  db.product.updateMany.mockResolvedValue({ count: 1 });
});

describe("original perfume classification and wholesale availability", () => {
  it("covers category descendants and authoritative 1C classification, not a product name or a copy", () => {
    const exempt = originalPerfumeCategories(categories);
    expect(shopReserve({ categoryGuid: ORIGINAL }, exempt)).toBe(0);
    expect(shopReserve({ categoryGuid: "child" }, exempt)).toBe(0);
    expect(shopReserve({ categoryGuid: "manual", categoryGuid1C: ORIGINAL }, exempt)).toBe(0);
    expect(shopReserve({ name: "Парфюм Оригинал", categoryGuid: "copy" }, exempt)).toBe(12);
    expect(shopReserve({ categoryGuid: "gift-original" }, exempt)).toBe(12);
  });
  it.each([1, 5, 11, 12, 13, 30])("all %s shop units are available without manufacturing stock", (qty) => {
    expect(wholesaleAvailable(qty, [{ guid: SHOP, qty }], SHOP, 0)).toBe(qty);
    expect(wholesaleAvailable(qty, null, SHOP, 0)).toBe(qty);
    expect(wholesaleAvailable(qty, [{ guid: SHOP, qty }], SHOP)).toBe(Math.max(0, qty - 12));
  });
  it("includes warehouse stock once; zero and negative stock remain unavailable", () => {
    expect(wholesaleAvailable(8, [{ guid: SHOP, qty: 3 }, { guid: STOCK, qty: 5 }], SHOP, 0)).toBe(8);
    expect(wholesaleAvailable(0, null, SHOP, 0)).toBe(0);
    expect(wholesaleAvailable(-3, null, SHOP, 0)).toBe(0);
  });
  it("recognises future category trees and terminates on cyclic or missing parents", () => {
    const set = originalPerfumeCategories([{ guid: "new", name: " ПАРФЮМ  ОРИГИНАЛ ", parentGuid: null }, { guid: "nested", name: "nested", parentGuid: "new" }, { guid: "loop", name: "loop", parentGuid: "loop" }]);
    expect(set.has("nested")).toBe(true); expect(set.has("loop")).toBe(false);
  });
});

describe("materialised catalogue availability", () => {
  it("updates only availability, preserving physical stock, prices and hidden state, with a concurrency guard", async () => {
    db.product.findMany.mockResolvedValue([
      { id: 1, stock: 1, wholesaleStock: 0, categoryGuid: ORIGINAL, warehouseStock: [{ warehouseGuid: SHOP, qty: 1 }] },
      { id: 2, stock: 5, wholesaleStock: 0, categoryGuid: "copy", warehouseStock: [] },
      { id: 3, stock: 0, wholesaleStock: 0, categoryGuid: ORIGINAL, warehouseStock: [] },
      { id: 4, stock: 3, wholesaleStock: 0, categoryGuid: "child", warehouseStock: [] },
    ]);
    expect(await refreshWholesaleStock(db)).toEqual({ checked: 4, changed: 2, skipped: 0 });
    expect(db.product.updateMany.mock.calls).toEqual([
      [{ where: { id: 1, stock: 1, wholesaleStock: 0 }, data: { wholesaleStock: 1 } }],
      [{ where: { id: 4, stock: 3, wholesaleStock: 0 }, data: { wholesaleStock: 3 } }],
    ]);
  });
  it("does not replace a concurrently imported stock and reports the skip", async () => {
    db.product.findMany.mockResolvedValue([{ id: 1, stock: 1, wholesaleStock: 0, categoryGuid: ORIGINAL, warehouseStock: [] }]);
    db.product.updateMany.mockResolvedValue({ count: 0 });
    expect(await refreshWholesaleStock(db, { onlyOriginal: true })).toEqual({ checked: 1, changed: 0, skipped: 1 });
  });
});

describe("assembly and 1C document source", () => {
  beforeEach(() => {
    db.product.findMany.mockResolvedValue([{ id: 1, stock: 1, categoryGuid: ORIGINAL }, { id: 2, stock: 11, categoryGuid: "copy" }]);
    db.productWarehouseStock.findMany.mockResolvedValue([
      { product: { id: 1 }, warehouseGuid: SHOP, qty: 1 },
      { product: { id: 2 }, warehouseGuid: SHOP, qty: 11 },
      { product: { id: 2 }, warehouseGuid: STOCK, qty: 3 },
    ]);
  });
  it("suggests the shop for the last original unit and the warehouse for a copy under 12", async () => {
    const result = await orderSplits([{ id: 10, productId: 1, quantity: 1 }, { id: 20, productId: 2, quantity: 1 }]);
    expect(result.get(10)).toMatchObject({ shop: 1, stock: 0, shopKeep: 0, onlyStock: false });
    expect(result.get(20)).toMatchObject({ shop: 0, stock: 1, shopKeep: 12, onlyStock: true });
  });
  it("uses total stock as shop stock when there is no warehouse breakdown", async () => {
    db.productWarehouseStock.findMany.mockResolvedValue([]);
    expect((await orderSplits([{ id: 10, productId: 1, quantity: 1 }])).get(10)).toMatchObject({ shop: 1, stock: 0, primary: "shop", shopKeep: 0 });
  });
  it("preserves an explicit picker allocation", async () => {
    db.productWarehouseStock.findMany.mockResolvedValue([{ product: { id: 1 }, warehouseGuid: SHOP, qty: 1 }]);
    expect((await orderSplits([{ id: 10, productId: 1, quantity: 1, warehouseQty: toWarehouseQty({ shop: 0, stock: 1 }) }])).get(10)).toMatchObject({ shop: 0, stock: 1, suggested: false });
  });
});
