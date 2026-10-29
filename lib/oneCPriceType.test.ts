import { describe, expect, it } from "vitest";
import { priceTypeFrom1C } from "./oneCPriceType";

describe("priceTypeFrom1C — only «Опт» comes from 1C", () => {
  it("1C «Крупный опт» is never taken", () => {
    expect(priceTypeFrom1C("wholesale", "big_wholesale")).toBe("wholesale");
    expect(priceTypeFrom1C("retail", "big_wholesale")).toBe("retail");
  });
  it("1C «Опт» is taken", () => {
    expect(priceTypeFrom1C("wholesale", "wholesale")).toBe("wholesale");
    expect(priceTypeFrom1C("retail", "wholesale")).toBe("wholesale");
  });
  it("the customer's «Крупный опт» stays", () => {
    expect(priceTypeFrom1C("big_wholesale", "wholesale")).toBe("big_wholesale");
    expect(priceTypeFrom1C("big_wholesale", null)).toBe("big_wholesale");
  });
});
