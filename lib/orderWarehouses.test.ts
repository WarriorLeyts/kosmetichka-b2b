import { describe, expect, it } from "vitest";
import { SHOP_WAREHOUSE, STOCK_WAREHOUSE, savedSplit, suggestSplit, toWarehouseQty } from "./orderWarehouses";

describe("the 12-piece rule", () => {
  it("shop has plenty: all from the shop", () => {
    expect(suggestSplit(5, 40, 100)).toEqual({ shop: 5, stock: 0 });
  });
  it("shampoo: shop 11, warehouse 32 — everything from the warehouse", () => {
    expect(suggestSplit(10, 11, 32)).toEqual({ shop: 0, stock: 10 });
  });
  it("shop 20: 8 may go, the rest from the warehouse", () => {
    expect(suggestSplit(15, 20, 50)).toEqual({ shop: 8, stock: 7 });
  });
  it("the warehouse hasn't got enough: the shop gives the rest", () => {
    expect(suggestSplit(30, 15, 10)).toEqual({ shop: 20, stock: 10 });
  });
});

describe("the picker's choice", () => {
  it("kept while it adds up to the line", () => {
    const w = toWarehouseQty({ shop: 4, stock: 6 });
    expect(w).toEqual({ [SHOP_WAREHOUSE]: 4, [STOCK_WAREHOUSE]: 6 });
    expect(savedSplit(w, 10)).toEqual({ shop: 4, stock: 6 });
  });
  it("the quantity changed since — the rule again", () => {
    expect(savedSplit(toWarehouseQty({ shop: 4, stock: 6 }), 12)).toBeNull();
    expect(savedSplit(null, 3)).toBeNull();
  });
});
