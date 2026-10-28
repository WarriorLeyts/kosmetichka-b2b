import { describe, it, expect } from "vitest";
import {
  resolveCustomerPriceType,
  priceFor,
  rawCartTotal,
  effectivePriceType,
  amountUntilMinOrder,
  minOrderFor,
  cartPriceTier,
  nextPriceTier,
  WHOLESALE_MIN_ORDER,
  BIG_WHOLESALE_MIN_ORDER,
} from "./pricing";
import type { CartItem } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<CartItem> & { quantity: number }
): CartItem {
  return {
    id: 1,
    name: "Test product",
    retailPrice: 100,
    discountPrice: 80,
    wholesalePrice: 60,
    bigWholesalePrice: 50,
    cartKey: "1",
    ...overrides,
  };
}

// ── resolveCustomerPriceType ──────────────────────────────────────────────────

describe("resolveCustomerPriceType", () => {
  it("returns guest for null customer", () => {
    expect(resolveCustomerPriceType(null)).toBe("guest");
  });

  it("returns big_wholesale", () => {
    expect(resolveCustomerPriceType({ priceType: "big_wholesale" })).toBe("big_wholesale");
  });

  it("returns wholesale", () => {
    expect(resolveCustomerPriceType({ priceType: "wholesale" })).toBe("wholesale");
  });

  it("returns retail", () => {
    expect(resolveCustomerPriceType({ priceType: "retail" })).toBe("retail");
  });

  it("returns discount for unknown priceType", () => {
    expect(resolveCustomerPriceType({ priceType: "unknown" })).toBe("discount");
  });

  it("returns discount for null priceType", () => {
    expect(resolveCustomerPriceType({ priceType: null })).toBe("discount");
  });
});

// ── priceFor ─────────────────────────────────────────────────────────────────

describe("priceFor", () => {
  const product = {
    retailPrice: 100,
    discountPrice: 80,
    wholesalePrice: 60,
    bigWholesalePrice: 50,
  };

  it("returns retailPrice for retail tier", () => {
    expect(priceFor(product, "retail")).toBe(100);
  });

  it("returns discountPrice for guest tier", () => {
    expect(priceFor(product, "guest")).toBe(80);
  });

  it("returns discountPrice for discount tier", () => {
    expect(priceFor(product, "discount")).toBe(80);
  });

  it("returns wholesalePrice for wholesale tier", () => {
    expect(priceFor(product, "wholesale")).toBe(60);
  });

  it("returns bigWholesalePrice for big_wholesale tier", () => {
    expect(priceFor(product, "big_wholesale")).toBe(50);
  });

  it("falls back to retailPrice when discountPrice is missing (guest)", () => {
    expect(priceFor({ retailPrice: 100, discountPrice: null }, "guest")).toBe(100);
  });

  it("falls back to wholesalePrice when bigWholesalePrice is missing", () => {
    expect(priceFor({ wholesalePrice: 60, bigWholesalePrice: null }, "big_wholesale")).toBe(60);
  });

  it("wholesale without its own price (0 from 1C) → retail, not 0 ₽", () => {
    expect(priceFor({ retailPrice: 400, wholesalePrice: 0, bigWholesalePrice: null }, "wholesale")).toBe(400);
    expect(priceFor({ retailPrice: 400, wholesalePrice: 0, bigWholesalePrice: null }, "big_wholesale")).toBe(400);
    expect(priceFor({ retailPrice: 400, discountPrice: 0 }, "discount")).toBe(400);
  });

  it("returns 0 when all prices are missing", () => {
    expect(priceFor({}, "wholesale")).toBe(0);
  });
});

// ── rawCartTotal ──────────────────────────────────────────────────────────────

describe("rawCartTotal", () => {
  it("returns 0 for empty cart", () => {
    expect(rawCartTotal([], "wholesale")).toBe(0);
  });

  it("sums wholesale prices", () => {
    const cart = [
      makeItem({ wholesalePrice: 60, quantity: 3 }),
      makeItem({ wholesalePrice: 40, quantity: 2 }),
    ];
    expect(rawCartTotal(cart, "wholesale")).toBe(3 * 60 + 2 * 40);
  });

  it("sums retail prices", () => {
    const cart = [makeItem({ retailPrice: 100, quantity: 2 })];
    expect(rawCartTotal(cart, "retail")).toBe(200);
  });
});

// ── effectivePriceType ────────────────────────────────────────────────────────

describe("effectivePriceType — always the customer's own type", () => {
  const item = (qty: number) => makeItem({ quantity: qty });

  it("guest / retail / discount", () => {
    expect(effectivePriceType([item(1)], null)).toBe("guest");
    expect(effectivePriceType([item(1000)], { priceType: "retail" })).toBe("retail");
    expect(effectivePriceType([item(1000)], { priceType: "discount" })).toBe("discount");
  });

  it("wholesale gets wholesale prices on a small cart", () => {
    expect(effectivePriceType([item(1)], { priceType: "wholesale" })).toBe("wholesale");
  });

  it("wholesale stays wholesale on a huge cart (no auto-upgrade)", () => {
    expect(effectivePriceType([item(10_000)], { priceType: "wholesale" })).toBe("wholesale");
  });

  it("big wholesale gets big prices on a small cart", () => {
    expect(effectivePriceType([item(1)], { priceType: "big_wholesale" })).toBe("big_wholesale");
  });
});

// ── price by the order sum («Опт») ───────────────────────────────────────────

describe("cartPriceTier", () => {
  // one product: discount 80, wholesale 60, big 50
  const cart = (qty: number) => [makeItem({ quantity: qty })];
  const opt = { priceType: "wholesale" };

  it("other types keep their own price", () => {
    expect(cartPriceTier(cart(1), null)).toBe("guest");
    expect(cartPriceTier(cart(1), { priceType: "retail" })).toBe("retail");
    expect(cartPriceTier(cart(1), { priceType: "discount" })).toBe("discount");
    // big wholesale set by the manager — at any sum
    expect(cartPriceTier(cart(1), { priceType: "big_wholesale" })).toBe("big_wholesale");
  });

  it("«Опт»: less than 5 000 in wholesale prices → discount", () => {
    expect(cartPriceTier(cart(83), opt)).toBe("discount"); // 83 × 60 = 4 980
  });

  it("«Опт»: from 5 000 in wholesale prices → wholesale", () => {
    expect(cartPriceTier(cart(84), opt)).toBe("wholesale"); // 5 040
    expect(cartPriceTier(cart(999), opt)).toBe("wholesale"); // 49 950 in big prices
  });

  it("«Опт»: from 50 000 in big wholesale prices → big wholesale", () => {
    expect(cartPriceTier(cart(1000), opt)).toBe("big_wholesale"); // 1000 × 50
  });

  it("nextPriceTier: how much to add and the saving", () => {
    expect(nextPriceTier(cart(50), opt)).toEqual({ type: "wholesale", need: 5000 - 3000, save: 50 * 20 });
    expect(nextPriceTier(cart(100), opt)).toEqual({ type: "big_wholesale", need: 50000 - 5000, save: 100 * 10 });
    expect(nextPriceTier(cart(1000), opt)).toBeNull();
    expect(nextPriceTier(cart(1), { priceType: "retail" })).toBeNull();
    expect(nextPriceTier([], opt)).toBeNull();
  });
});

// ── minimum order ─────────────────────────────────────────────────────────────

describe("minOrderFor / amountUntilMinOrder — no minimum any more", () => {
  it("is 0 for everybody", () => {
    for (const t of [null, { priceType: "retail" }, { priceType: "discount" }, { priceType: "wholesale" }, { priceType: "big_wholesale" }]) {
      expect(minOrderFor(t)).toBe(0);
      expect(amountUntilMinOrder([makeItem({ quantity: 1 })], t)).toBe(0);
    }
    expect(WHOLESALE_MIN_ORDER).toBe(5_000);
    expect(BIG_WHOLESALE_MIN_ORDER).toBe(50_000);
  });
});
