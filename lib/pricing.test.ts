import { describe, it, expect } from "vitest";
import {
  resolveCustomerPriceType,
  priceFor,
  rawCartTotal,
  effectivePriceType,
  amountUntilWholesale,
  amountUntilBigWholesale,
  WHOLESALE_THRESHOLD,
  BIG_WHOLESALE_THRESHOLD,
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

describe("effectivePriceType", () => {
  const wItem = (wholesalePrice: number, qty: number) =>
    makeItem({ wholesalePrice, quantity: qty });

  it("returns guest for null customer", () => {
    expect(effectivePriceType([wItem(100, 1)], null)).toBe("guest");
  });

  it("always returns retail for retail customer", () => {
    expect(effectivePriceType([wItem(100, 100)], { priceType: "retail" })).toBe("retail");
  });

  it("always returns big_wholesale for big_wholesale customer", () => {
    expect(effectivePriceType([wItem(1, 1)], { priceType: "big_wholesale" })).toBe("big_wholesale");
  });

  it("always returns discount for discount customer (no upgrade)", () => {
    const bigCart = [wItem(100, 1000)]; // 100 000 wholesale — above big threshold
    expect(effectivePriceType(bigCart, { priceType: "discount" })).toBe("discount");
  });

  it("wholesale customer below threshold → discount", () => {
    const cart = [wItem(100, 1)]; // 100 < 5000
    expect(effectivePriceType(cart, { priceType: "wholesale" })).toBe("discount");
  });

  it(`wholesale customer at exactly ${WHOLESALE_THRESHOLD} → wholesale`, () => {
    const cart = [wItem(WHOLESALE_THRESHOLD, 1)];
    expect(effectivePriceType(cart, { priceType: "wholesale" })).toBe("wholesale");
  });

  it("wholesale customer between thresholds → wholesale", () => {
    const cart = [wItem(10_000, 1)];
    expect(effectivePriceType(cart, { priceType: "wholesale" })).toBe("wholesale");
  });

  it(`wholesale customer at exactly ${BIG_WHOLESALE_THRESHOLD} → big_wholesale`, () => {
    const cart = [wItem(BIG_WHOLESALE_THRESHOLD, 1)];
    expect(effectivePriceType(cart, { priceType: "wholesale" })).toBe("big_wholesale");
  });

  it("wholesale customer above big threshold → big_wholesale", () => {
    const cart = [wItem(100, 600)]; // 60 000 > 50 000
    expect(effectivePriceType(cart, { priceType: "wholesale" })).toBe("big_wholesale");
  });

  it("upgrade is based on wholesale total, not retail total", () => {
    // retail = 200, wholesale = 1 — never reaches threshold
    const cart = [makeItem({ retailPrice: 200, wholesalePrice: 1, quantity: 1 })];
    expect(effectivePriceType(cart, { priceType: "wholesale" })).toBe("discount");
  });
});

// ── amountUntilWholesale ──────────────────────────────────────────────────────

describe("amountUntilWholesale", () => {
  it("returns 0 for non-wholesale customer", () => {
    expect(amountUntilWholesale([], { priceType: "retail" })).toBe(0);
    expect(amountUntilWholesale([], null)).toBe(0);
  });

  it("returns remaining amount for wholesale customer below threshold", () => {
    const cart = [makeItem({ wholesalePrice: 1000, quantity: 2 })]; // 2000 total
    expect(amountUntilWholesale(cart, { priceType: "wholesale" })).toBe(WHOLESALE_THRESHOLD - 2000);
  });

  it("returns 0 when threshold is already reached", () => {
    const cart = [makeItem({ wholesalePrice: WHOLESALE_THRESHOLD, quantity: 1 })];
    expect(amountUntilWholesale(cart, { priceType: "wholesale" })).toBe(0);
  });
});

// ── amountUntilBigWholesale ───────────────────────────────────────────────────

describe("amountUntilBigWholesale", () => {
  it("returns 0 for big_wholesale customer", () => {
    expect(amountUntilBigWholesale([], { priceType: "big_wholesale" })).toBe(0);
  });

  it("returns 0 for guest", () => {
    expect(amountUntilBigWholesale([], null)).toBe(0);
  });

  it("returns remaining for wholesale customer", () => {
    const cart = [makeItem({ wholesalePrice: 10_000, quantity: 1 })];
    expect(amountUntilBigWholesale(cart, { priceType: "wholesale" })).toBe(BIG_WHOLESALE_THRESHOLD - 10_000);
  });

  it("returns 0 when big threshold is already reached", () => {
    const cart = [makeItem({ wholesalePrice: BIG_WHOLESALE_THRESHOLD, quantity: 1 })];
    expect(amountUntilBigWholesale(cart, { priceType: "wholesale" })).toBe(0);
  });
});
