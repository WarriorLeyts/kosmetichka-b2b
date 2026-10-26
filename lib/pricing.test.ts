import { describe, it, expect } from "vitest";
import {
  resolveCustomerPriceType,
  priceFor,
  rawCartTotal,
  effectivePriceType,
  amountUntilMinOrder,
  minOrderFor,
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

// ── minimum order ─────────────────────────────────────────────────────────────

describe("minOrderFor / amountUntilMinOrder", () => {
  it("no minimum for guest, retail, discount", () => {
    expect(minOrderFor(null)).toBe(0);
    expect(minOrderFor({ priceType: "retail" })).toBe(0);
    expect(minOrderFor({ priceType: "discount" })).toBe(0);
    expect(amountUntilMinOrder([makeItem({ quantity: 1 })], { priceType: "retail" })).toBe(0);
  });

  it("wholesale: from 5 000 in wholesale prices", () => {
    expect(minOrderFor({ priceType: "wholesale" })).toBe(WHOLESALE_MIN_ORDER);
    // 10 × 60 = 600
    expect(amountUntilMinOrder([makeItem({ quantity: 10 })], { priceType: "wholesale" })).toBe(WHOLESALE_MIN_ORDER - 600);
    expect(amountUntilMinOrder([makeItem({ quantity: 100 })], { priceType: "wholesale" })).toBe(0);
  });

  it("big wholesale: from 50 000 in big wholesale prices", () => {
    expect(minOrderFor({ priceType: "big_wholesale" })).toBe(BIG_WHOLESALE_MIN_ORDER);
    // 100 × 50 = 5 000
    expect(amountUntilMinOrder([makeItem({ quantity: 100 })], { priceType: "big_wholesale" })).toBe(BIG_WHOLESALE_MIN_ORDER - 5_000);
    expect(amountUntilMinOrder([makeItem({ quantity: 1000 })], { priceType: "big_wholesale" })).toBe(0);
  });
});
