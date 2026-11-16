import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("../scripts/onec-odata.js", () => ({ odataConfigured: () => false, odataGet: vi.fn() }));
import { cardGivesDiscount } from "./discountCard";
import { pricingCustomer } from "./siteMode";

const req = new Request("https://x/");

describe("discount card: only the 1С group «Максма Скидка»", () => {
  it.each(["9000130012345", " 900 013 0012345 ", "9900130034795", "1817000000000"])("requires group membership regardless of card number %s", (loyaltyCard) => {
    expect(cardGivesDiscount({ loyaltyCard })).toBe(false);
    expect(cardGivesDiscount({ loyaltyCard, maxmaDiscount: false })).toBe(false);
    expect(cardGivesDiscount({ loyaltyCard, maxmaDiscount: true })).toBe(true);
    expect(pricingCustomer({ priceType: "retail", loyaltyCard }, req).priceType).toBe("retail");
    expect(pricingCustomer({ priceType: "retail", loyaltyCard, maxmaDiscount: true }, req).priceType).toBe("discount");
  });
  it.each([null, undefined, "", "  "])("no card — no discount, whatever the flag (%s)", (loyaltyCard) => {
    expect(cardGivesDiscount({ loyaltyCard, maxmaDiscount: true })).toBe(false);
  });
  it("preserves wholesale pricing even for group members", () => {
    expect(pricingCustomer({ priceType: "wholesale", loyaltyCard: "9000000000001", maxmaDiscount: true }, req).priceType).toBe("wholesale");
  });
});
