import { describe, expect, it } from "vitest";
import { bonusSpendOff, fromSite, pricingCustomer } from "./siteMode";

const req = (web: boolean) => new Request("https://x/api/orders", { method: "POST", headers: web ? { "X-Kosmetichka-Client": "web" } : {} });

describe("website: retail customers with a card pay the discount price", () => {
  it("only requests from the website build", () => {
    expect(fromSite(req(true))).toBe(true);
    expect(fromSite(req(false))).toBe(false);
  });
  it("«Розница» with a card → «Скидка по карте» on the website and in the apps", () => {
    expect(pricingCustomer({ id: 1, priceType: "retail", loyaltyCard: "2000123" }, req(true))).toEqual({ id: 1, priceType: "discount", loyaltyCard: "2000123" });
    expect(pricingCustomer({ id: 1, priceType: "retail", loyaltyCard: "2000123" }, req(false)).priceType).toBe("discount");
  });
  it("no bonus spending on the website or in the apps", () => {
    expect(bonusSpendOff(req(true))).toBe(true);
    expect(bonusSpendOff(req(false))).toBe(true);
  });
  it("no card (or unlinked) → retail prices", () => {
    expect(pricingCustomer({ priceType: "retail", loyaltyCard: null }, req(true)).priceType).toBe("retail");
    expect(pricingCustomer({ priceType: "retail", loyaltyCard: "  " }, req(true)).priceType).toBe("retail");
    expect(pricingCustomer({ priceType: "retail" }, req(true)).priceType).toBe("retail");
  });
  it("other price types never change", () => {
    for (const t of ["discount", "wholesale", "big_wholesale", null]) {
      expect(pricingCustomer({ priceType: t, loyaltyCard: "2000123" }, req(true)).priceType).toBe(t);
    }
  });
});
