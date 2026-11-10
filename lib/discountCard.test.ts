import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("../scripts/onec-odata.js", () => ({ odataConfigured: () => false, odataGet: vi.fn() }));
import { cardGivesDiscount } from "./discountCard";
import { pricingCustomer } from "./siteMode";

const req = new Request("https://x/");

describe("discount card: «900…» or the 1С group «Максма Скидка»", () => {
  it("900… gives the discount price", () => {
    expect(cardGivesDiscount({ loyaltyCard: "9000130012345" })).toBe(true);
    expect(cardGivesDiscount({ loyaltyCard: " 900 013 0012345 " })).toBe(true);
  });
  it("990… / other cards — only when the owner is in «Максма Скидка»", () => {
    expect(cardGivesDiscount({ loyaltyCard: "9900130034795" })).toBe(false);
    expect(cardGivesDiscount({ loyaltyCard: "1817000000000" })).toBe(false);
    expect(cardGivesDiscount({ loyaltyCard: "9900130034795", maxmaDiscount: true })).toBe(true);
  });
  it("no card — no discount, whatever the flag", () => {
    expect(cardGivesDiscount({ loyaltyCard: null, maxmaDiscount: true })).toBe(false);
  });
  it("pricingCustomer: retail + 900 → discount, retail + 990 → retail", () => {
    expect(pricingCustomer({ priceType: "retail", loyaltyCard: "9000000000001" }, req).priceType).toBe("discount");
    expect(pricingCustomer({ priceType: "retail", loyaltyCard: "9900130034795" }, req).priceType).toBe("retail");
    expect(pricingCustomer({ priceType: "wholesale", loyaltyCard: "9000000000001" }, req).priceType).toBe("wholesale");
  });
});
