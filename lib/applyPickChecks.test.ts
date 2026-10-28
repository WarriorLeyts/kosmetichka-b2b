import { describe, expect, it } from "vitest";
import { parseCheck, pickedQuantity } from "./applyPickChecks";

describe("assembly check → quantity the customer gets", () => {
  it("OK keeps the quantity", () => expect(pickedQuantity(3, "ok", null)).toBe(3));
  it("out of stock removes the line", () => expect(pickedQuantity(3, '["out_of_stock"]', null)).toBe(0));
  it("not enough: what is there (fact 2 of 3)", () => expect(pickedQuantity(3, '["insufficient_qty"]', 2)).toBe(2));
  it("not enough, number in the status data", () => expect(pickedQuantity(5, '[{"s":"insufficient_qty","q":4}]', null)).toBe(4));
  it("spoiled pieces with a number are taken out", () => expect(pickedQuantity(5, '[{"s":"expired","q":2},{"s":"bad_condition","q":1}]', null)).toBe(2));
  it("spoiled without a number: the line stays", () => expect(pickedQuantity(5, '["bad_condition"]', null)).toBe(5));
  it("never more than ordered, never below 0", () => {
    expect(pickedQuantity(3, '["insufficient_qty"]', 7)).toBe(3);
    expect(pickedQuantity(1, '[{"s":"expired","q":4}]', null)).toBe(0);
  });
  it("legacy single code", () => expect(parseCheck("out_of_stock")).toEqual([{ s: "out_of_stock", q: null }]));
});
