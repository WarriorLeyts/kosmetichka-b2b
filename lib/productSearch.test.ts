import { describe, expect, it } from "vitest";
import { otherLayout, productSearchWhere, searchWords } from "./productSearch";

describe("product search", () => {
  it("splits into words", () => {
    expect(searchWords("  SHIK  тон ")).toEqual(["shik", "тон"]);
  });
  it("every word must match (name, brand, article or barcode)", () => {
    const w = productSearchWhere("shik тон") as { AND: { OR: unknown[] }[] };
    expect(w.AND).toHaveLength(2);
    expect(JSON.stringify(w.AND[0])).toContain('"brand"');
  });
  it("wrong keyboard layout", () => {
    expect(otherLayout("ырш")).toBe("shi");
    expect(otherLayout("nfy")).toBe("тан");
    expect(otherLayout("50ml")).toBeNull();
  });
  it("empty query — no condition", () => {
    expect(productSearchWhere("  ")).toEqual({});
  });
});
