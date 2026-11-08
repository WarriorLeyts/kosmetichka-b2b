import { describe, expect, it, vi } from "vitest";
import { hideMissing, isDeletedIn1C, offerTotalStock, offerWarehouseStock, toKopecks, warehouseNames } from "../scripts/onec-helpers.js";

describe("1C prices are kept to kopecks (P2-07)", () => {
  it("rounds float tails and strings from the XML", () => {
    expect(toKopecks("145.95")).toBe(145.95);
    expect(toKopecks(145.94999999999998)).toBe(145.95);
    expect(toKopecks("1300.13")).toBe(1300.13);
    expect(toKopecks("462.5")).toBe(462.5);
    expect(toKopecks("")).toBe(0);
    expect(toKopecks("abc")).toBe(0);
  });
});

describe("products deleted in 1C (P2-09)", () => {
  it("recognises the deletion marks", () => {
    expect(isDeletedIn1C({ Ид: "a", Статус: "Удален" })).toBe(true);
    expect(isDeletedIn1C({ Ид: "a", ПометкаУдаления: "true" })).toBe(true);
    expect(isDeletedIn1C({ Ид: "a" })).toBe(false);
    expect(isDeletedIn1C({ Ид: "a", ПометкаУдаления: "false" })).toBe(false);
  });

  const db = (inStock: string[]) => ({
    product: {
      findMany: vi.fn(async () => inStock.map((guid) => ({ guid }))),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  });

  it("a full upload hides (stock 0) the in-stock products it doesn't list", async () => {
    const d = db(["a", "b", "c", "d"]);
    expect(await hideMissing(d, ["a", "b", "c"], "test")).toBe(1);
    expect(d.product.updateMany).toHaveBeenCalledWith({ where: { guid: { in: ["d"] } }, data: { stock: 0 } });
  });

  it("a «full» file with under half the products is taken as broken: nothing is hidden", async () => {
    const d = db(["a", "b", "c", "d", "e"]);
    expect(await hideMissing(d, ["a"], "test")).toBe(0);
    expect(d.product.updateMany).not.toHaveBeenCalled();
  });
});

describe("stock per warehouse («Разбивать остатки по складам»)", () => {
  it("reads the CommerceML 2.08 form: <Склад ИдСклада КоличествоНаСкладе/>", () => {
    const offer = { Ид: "p", Количество: 7, Склад: [{ ИдСклада: "w1", КоличествоНаСкладе: "5" }, { ИдСклада: "w2", КоличествоНаСкладе: 2 }] };
    expect(offerWarehouseStock(offer)).toEqual([{ guid: "w1", qty: 5 }, { guid: "w2", qty: 2 }]);
    expect(offerTotalStock(offer, offerWarehouseStock(offer))).toBe(7);
  });

  it("reads a single warehouse and the 2.10 form <Остатки>", () => {
    expect(offerWarehouseStock({ Склад: { ИдСклада: "w1", КоличествоНаСкладе: "3,5" } })).toEqual([{ guid: "w1", qty: 3.5 }]);
    const offer = { Остатки: { Остаток: { Склад: [{ Ид: "a", Количество: 1 }, { Ид: "b", Количество: 4 }] } } };
    expect(offerWarehouseStock(offer)).toEqual([{ guid: "a", qty: 1 }, { guid: "b", qty: 4 }]);
  });

  it("no split → null, total from <Количество> as before", () => {
    const offer = { Ид: "p", Количество: 10 };
    expect(offerWarehouseStock(offer)).toBeNull();
    expect(offerTotalStock(offer, null)).toBe(10);
    expect(offerTotalStock({ Ид: "p" }, null)).toBe(0);
  });

  it("only the split → the total is the sum (negatives ignored)", () => {
    const split = offerWarehouseStock({ Склад: [{ ИдСклада: "a", КоличествоНаСкладе: 3 }, { ИдСклада: "b", КоличествоНаСкладе: -1 }, { ИдСклада: "c", КоличествоНаСкладе: 2 }] });
    expect(offerTotalStock({}, split)).toBe(5);
  });

  it("warehouse names from «Склады»", () => {
    const names = warehouseNames({ Склады: { Склад: [{ Ид: "a", Наименование: "Магазин Ленина" }, { Ид: "b" }] } });
    expect(names.get("a")).toBe("Магазин Ленина");
    expect(names.get("b")).toBe("b");
    expect(warehouseNames({}).size).toBe(0);
  });
});
