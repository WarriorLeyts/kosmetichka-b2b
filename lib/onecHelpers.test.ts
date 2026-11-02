import { describe, expect, it, vi } from "vitest";
import { hideMissing, isDeletedIn1C, toKopecks } from "../scripts/onec-helpers.js";

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
