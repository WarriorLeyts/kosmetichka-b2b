import { describe, expect, it } from "vitest";
import { LEGACY_CAMPAIGN } from "./campaign";
import { calculateCart, cartPriceTier, minOrderFor, priceFor } from "./pricing";
import { withFlatPrices, maskWholesalePrices } from "./utils";
import { maskFranchiseSnapshot, pendingFranchiseOrder } from "./franchise";
import { roleOptions, isSwitchTarget, switchDecision } from "./roles";
import { registrationPriceType } from "./oneCPriceType";

const customer = { priceType: "franchise" };
const product = { quantity: 3, franchisePrice: 100, retailPrice: 500, discountPrice: 400, wholesalePrice: 200, bigWholesalePrice: 150, promoRetailPrice: 10 };
const now = Date.parse("2026-11-20T12:00:00+03:00");

describe("administrator-granted franchise pricing", () => {
  it("uses the fixed 1C price at every cart total and never substitutes a retail promotion", () => {
    expect(priceFor(product, "franchise", now, LEGACY_CAMPAIGN)).toBe(100);
    expect(cartPriceTier([{ ...product, quantity: 1000 }], customer)).toBe("franchise");
    expect(calculateCart([product], customer, now, LEGACY_CAMPAIGN)).toMatchObject({ tier: "franchise", total: 300, percent: 0 });
  });
  it("keeps missing prices pending rather than substituting a card/retail tariff", () => {
    expect(priceFor({ ...product, franchisePrice: null }, "franchise")).toBe(0);
    expect(pendingFranchiseOrder({ priceType: "franchise", items: [{ price: 0 }, { price: 100 }] })).toBe(true);
    expect(pendingFranchiseOrder({ priceType: "retail", items: [{ price: 0 }] })).toBe(false);
    expect(minOrderFor(customer, [], true)).toBe(0);
    expect(minOrderFor(customer)).toBe(1000);
  });
  it("reads already-imported Russian price names without a database migration", () => {
    const rows = { prices: [{ priceType: "франшиза", price: 125 }, { priceType: "retail", price: 500 }] };
    expect(withFlatPrices(rows, LEGACY_CAMPAIGN, true).franchisePrice).toBe(125);
    const ordinary = withFlatPrices(rows);
    expect(ordinary).not.toHaveProperty("franchisePrice");
    expect(ordinary.regularPrices).not.toHaveProperty("franchisePrice");
    expect(ordinary.prices).toEqual([{ priceType: "retail", price: 500 }]);
    expect(maskWholesalePrices(withFlatPrices(rows, LEGACY_CAMPAIGN, true))).not.toHaveProperty("franchisePrice");
  });
  it("does not permit self-selection, 1C auto-grants or self-switching of an administrator's tariff", () => {
    expect(isSwitchTarget("franchise")).toBe(false);
    expect(registrationPriceType("franchise", "franchise")).not.toBe("franchise");
    expect(roleOptions(customer)).toEqual([{ value: "franchise", label: "Франшиза", state: "current" }]);
    expect(switchDecision(customer, "wholesale")).toBe("forbidden");
  });
  it("removes old privileged prices from saved snapshots after access is removed", () => {
    expect(maskFranchiseSnapshot({ id: 1, franchisePrice: 10, regularPrices: { franchisePrice: 10, retailPrice: 500 } }, false)).toEqual({ id: 1, regularPrices: { retailPrice: 500 } });
  });
});
