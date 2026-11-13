import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCart, cartItemPrice, cartItemPromotionalPrice, cartPriceTier, nextPriceTier } from "./pricing";
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { product: { findMany } } }));
import { priceOrder } from "./orderPricing";

const during = Date.parse("2026-11-13T12:00:00+03:00");
const after = Date.parse("2026-12-01T00:00:00+03:00");
const opt = { priceType: "wholesale" };
const vt = { id: 111798, quantity: 1, retailPrice: 1699, discountPrice: 1699,
  wholesalePrice: 1168, bigWholesalePrice: 1168,
  promoRetailPrice: 1699, promoWholesalePrice: 1168, promoBigWholesalePrice: 1168,
  regularPrices: { retailPrice: 2090, discountPrice: 1880, wholesalePrice: 1400, bigWholesalePrice: 1260 } };

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(during); findMany.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe("wholesale shock prices in a small cart", () => {
  it("prices the screenshot VT item at 1168 despite the ordinary discount tier", () => {
    expect(cartPriceTier([vt], opt, during)).toBe("discount");
    expect(cartItemPrice(vt, "discount", opt, during)).toBe(1168);
    expect(calculateCart([vt], opt, during).total).toBe(1168);
    expect(nextPriceTier([vt], opt, during)).toEqual({ type: "wholesale", need: 3832, save: 0 });
  });
  it("keeps ordinary goods at their discount price in a mixed small cart", () => {
    const ordinary = { ...vt, id: 2, promoWholesalePrice: null };
    expect(cartItemPrice(ordinary, "discount", opt, during)).toBe(1880);
    expect(cartItemPromotionalPrice(ordinary, "discount", opt, during)).toBeNull();
    expect(calculateCart([vt, ordinary], opt, during).subtotal).toBe(3048);
  });
  it("keeps retail and guest pricing at 1699 and expires the shock override", () => {
    for (const customer of [null, { priceType: "retail" }, { priceType: "discount" }])
      expect(calculateCart([vt], customer, during).total).toBe(1699);
    expect(cartItemPrice(vt, "discount", opt, after)).toBe(1880);
  });
  it("does not invent a wholesale promotion from the big-wholesale tariff", () => {
    expect(cartItemPrice({ ...vt, promoWholesalePrice: null }, "discount", opt, during)).toBe(1880);
  });
  it("uses the same item prices and totals in checkout, reloaded from the database", async () => {
    const prices = [
      ["retail",2090],["discount",1880],["wholesale",1400],["big_wholesale",1260],
      ["promo_retail",1699],["promo_wholesale",1168],["promo_big_wholesale",1168],
    ].map(([priceType,price]) => ({ priceType, price }));
    findMany.mockResolvedValue([{ id:111798, guid:"vt", name:"VT Cosmetics", stock:100, wholesaleStock:100, minOrderQty:1, prices }]);
    const result = await priceOrder(opt, [{ id:111798, quantity:1 }]);
    expect(result.lines[0]).toMatchObject({ price:1168, total:1168, quantity:1 });
    expect(result.pricing.total).toBe(1168);
  });
});
