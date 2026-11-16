import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const odata = vi.hoisted(() => ({ odataConfigured: vi.fn(), odataGet: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../scripts/onec-odata.js", () => odata);
import { cardGivesDiscount, refreshMaxmaDiscount } from "./discountCard";
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

describe("same card changes status through its owner's 1C folder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    odata.odataConfigured.mockReturnValue(true);
    db.customer.findUnique.mockResolvedValue({ loyaltyCard: "990123", maxmaDiscount: false });
    odata.odataGet.mockImplementation(async (entity, params) => {
      if (entity === "Catalog_ДисконтныеКарты") return [{ ВладелецКарты_Key: "owner", DeletionMark: false }];
      if (params.$filter === "IsFolder eq true") return [{ Ref_Key: "discounts", Description: "Максма Скидка", DeletionMark: false }];
      return [{ Parent_Key: "discounts" }];
    });
  });
  it("enables discount on the existing bonus card when its owner enters the folder", async () => {
    expect(await refreshMaxmaDiscount(1)).toBe(true);
    expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, loyaltyCard: "990123", maxmaDiscount: false }, data: { maxmaDiscount: true } });
  });
  it("removes discount when its owner leaves the folder", async () => {
    db.customer.findUnique.mockResolvedValue({ loyaltyCard: "990123", maxmaDiscount: true });
    odata.odataGet.mockImplementation(async (entity) => entity === "Catalog_ДисконтныеКарты" ? [{ ВладелецКарты_Key: "owner", DeletionMark: false }] : [{ Parent_Key: "other" }]);
    expect(await refreshMaxmaDiscount(1)).toBe(false);
    expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, loyaltyCard: "990123", maxmaDiscount: true }, data: { maxmaDiscount: false } });
  });
  it("keeps the existing status when 1C is unavailable", async () => {
    db.customer.findUnique.mockResolvedValue({ loyaltyCard: "990123", maxmaDiscount: true });
    odata.odataGet.mockRejectedValue(new Error("offline"));
    expect(await refreshMaxmaDiscount(1)).toBe(true);
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
  it("keeps the existing status when 1C is not configured", async () => {
    db.customer.findUnique.mockResolvedValue({ loyaltyCard: "990123", maxmaDiscount: true });
    odata.odataConfigured.mockReturnValue(false);
    expect(await refreshMaxmaDiscount(1)).toBe(true);
    expect(odata.odataGet).not.toHaveBeenCalled();
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
});
