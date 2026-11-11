import { describe, expect, it } from "vitest";
import { SHOP_WAREHOUSE, STOCK_WAREHOUSE, onlyStock, orderPrimary, savedSplit, suggestSplit, toWarehouseQty } from "./orderWarehouses";

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
  it("the warehouse hasn't got enough: the shop still keeps 12", () => {
    expect(suggestSplit(30, 15, 10)).toEqual({ shop: 3, stock: 27 }); // the shop never below 12: the rest is a shortage
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

describe("12 or fewer in the shop — only the warehouse", () => {
  it("onlyStock", () => {
    expect(onlyStock(11)).toBe(true);
    expect(onlyStock(12)).toBe(true);
    expect(onlyStock(13)).toBe(false);
  });
  it("shop 11, warehouse 3, need 5 → all from the warehouse (2 will be «Не хватает»)", () => {
    expect(suggestSplit(5, 11, 3)).toEqual({ shop: 0, stock: 5 });
  });
});

describe("the order's main source — by the majority of lines", () => {
  // 10 lines: the warehouse has 8 in full, the shop 7 → the warehouse
  const lines = [
    ...Array.from({ length: 5 }, () => ({ qty: 3, shopQty: 40, stockQty: 50 })),
    ...Array.from({ length: 2 }, () => ({ qty: 3, shopQty: 40, stockQty: 0 })),
    ...Array.from({ length: 3 }, () => ({ qty: 3, shopQty: 5, stockQty: 20 })),
  ];
  it("more lines on the warehouse → the warehouse", () => {
    expect(orderPrimary(lines)).toBe("stock");
  });
  it("then the warehouse gives what it has, the shop only the rest", () => {
    expect(suggestSplit(3, 40, 50, "stock")).toEqual({ shop: 0, stock: 3 });
    expect(suggestSplit(3, 40, 0, "stock")).toEqual({ shop: 3, stock: 0 });
    expect(suggestSplit(10, 40, 6, "stock")).toEqual({ shop: 4, stock: 6 });
  });
  it("still keeps 12 in the shop", () => {
    expect(suggestSplit(10, 15, 4, "stock")).toEqual({ shop: 3, stock: 7 });
    expect(suggestSplit(3, 11, 0, "stock")).toEqual({ shop: 0, stock: 3 });
  });
  it("more lines in the shop → the shop", () => {
    expect(orderPrimary([{ qty: 2, shopQty: 30, stockQty: 0 }, { qty: 2, shopQty: 30, stockQty: 0 }, { qty: 2, shopQty: 30, stockQty: 9 }])).toBe("shop");
  });
  it("a tie → the warehouse", () => {
    expect(orderPrimary([{ qty: 2, shopQty: 30, stockQty: 0 }, { qty: 2, shopQty: 5, stockQty: 9 }])).toBe("stock");
  });
});
