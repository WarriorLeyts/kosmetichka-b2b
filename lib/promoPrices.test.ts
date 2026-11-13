import { afterEach, describe, expect, it, vi } from "vitest";
import { withFlatPrices, maskWholesalePrices } from "./utils";
import { priceFor } from "./pricing";

afterEach(() => vi.restoreAllMocks());
const product = { prices: [
  { priceType: "retail", price: 490 }, { priceType: "discount", price: 440 },
  { priceType: "wholesale", price: 190 }, { priceType: "big_wholesale", price: 180 },
  { priceType: "promo_retail", price: 399 }, { priceType: "promo_wholesale", price: 168 },
  { priceType: "promo_big_wholesale", price: 160 },
] };

describe("promotional API price snapshots", () => {
  it("serves campaign prices in legacy flat fields and keeps regular prices for expiry", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-15T12:00:00+03:00"));
    const p = withFlatPrices(product);
    expect(p).toMatchObject({ retailPrice: 399, discountPrice: 399, wholesalePrice: 168, bigWholesalePrice: 160 });
    expect(priceFor(p, "wholesale", Date.parse("2026-12-01T00:00:00+03:00"))).toBe(190);
    expect(p.prices).toEqual(product.prices);
  });
  it("does not expose wholesale promotions or regular-price snapshots to guests", () => {
    const p = maskWholesalePrices(withFlatPrices(product));
    expect(p).not.toHaveProperty("wholesalePrice");
    expect(p).not.toHaveProperty("bigWholesalePrice");
    expect(p).not.toHaveProperty("promoWholesalePrice");
    expect(p).not.toHaveProperty("promoBigWholesalePrice");
    expect(p.regularPrices).toEqual({ retailPrice: 490, discountPrice: 440 });
    expect(p.prices).toEqual([]);
  });
  it("keeps absent regular prices null outside the campaign", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-12-01T00:00:00+03:00"));
    expect(withFlatPrices({ prices: [{ priceType: "retail", price: 490 }] })).toMatchObject({
      retailPrice: 490, discountPrice: null, bigWholesalePrice: null, wholesalePrice: 0,
    });
  });
});
