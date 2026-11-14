import { describe, expect, it } from "vitest";
import { cardGivesDiscount, cardKind } from "./discountCardRule";
import { pricingCustomer } from "./siteMode";
const request = new Request("https://x/");
describe("loyalty kind from 1C groups only", () => {
  it.each(["900123", "990123", "123456"])("%s gives a discount only with the discount-group flag", (loyaltyCard) => {
    expect(cardGivesDiscount({ loyaltyCard })).toBe(false);
    expect(cardGivesDiscount({ loyaltyCard, maxmaRetail: true })).toBe(false);
    expect(cardGivesDiscount({ loyaltyCard, maxmaDiscount: true })).toBe(true);
  });
  it("requires a linked card and rejects conflicting flags", () => {
    expect(cardKind({ loyaltyCard: null, maxmaDiscount: true })).toBeNull();
    expect(cardKind({ loyaltyCard: "123", maxmaDiscount: true, maxmaRetail: true })).toBeNull();
    expect(cardKind({ loyaltyCard: "900123", maxmaRetail: true })).toBe("bonus");
  });
  it.each(["retail", "discount"])("%s prices follow linking/unlinking, not a prefix or legacy role", (priceType) => {
    expect(pricingCustomer({ priceType, loyaltyCard: "123456", maxmaDiscount: true }, request).priceType).toBe("discount");
    expect(pricingCustomer({ priceType, loyaltyCard: "900123", maxmaRetail: true }, request).priceType).toBe("retail");
    expect(pricingCustomer({ priceType, loyaltyCard: null, maxmaDiscount: true }, request).priceType).toBe("retail");
  });
  it("keeps wholesale pricing independent of card kind", () => {
    expect(pricingCustomer({ priceType: "wholesale", loyaltyCard: "123456", maxmaDiscount: true }, request).priceType).toBe("wholesale");
  });
});
