import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const odata = vi.hoisted(() => ({ odataConfigured: vi.fn(), odataGet: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../scripts/onec-odata.js", () => odata);
import { cardGivesDiscount, refreshMaxmaDiscount } from "./discountCard";
import { DISCOUNT_GROUP_REF } from "./discountCardRule";
beforeEach(() => { vi.clearAllMocks(); db.customer.findUnique.mockResolvedValue({ loyaltyCard: "990123", maxmaDiscount: false, maxmaRetail: false }); odata.odataConfigured.mockReturnValue(true); });
describe("card group refresh", () => {
  it("uses group membership rather than barcode prefixes", () => { for (const loyaltyCard of ["900123", "990123", "123456"]) { expect(cardGivesDiscount({ loyaltyCard, maxmaDiscount: true })).toBe(true); expect(cardGivesDiscount({ loyaltyCard, maxmaDiscount: false })).toBe(false); } });
  it("classifies from folder identity and saves both flags", async () => {
    const owner = "11111111-2222-3333-4444-555555555555";
    odata.odataGet.mockImplementation(async (entity, q) => entity === "Catalog_ДисконтныеКарты" ? [{ КодКартыШтрихкод: "990123", ВладелецКарты_Key: owner }] : q.$filter.startsWith("IsFolder") ? [{ Ref_Key: DISCOUNT_GROUP_REF, Description: "Скидочная", IsFolder: true }] : [{ Ref_Key: owner, Parent_Key: DISCOUNT_GROUP_REF, IsFolder: false }]);
    expect(await refreshMaxmaDiscount(1)).toBe(true); expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, loyaltyCard: "990123", maxmaDiscount: false, maxmaRetail: false }, data: { maxmaDiscount: true, maxmaRetail: false } });
  });
  it("preserves existing flags during 1C failures", async () => {
    db.customer.findUnique.mockResolvedValue({ loyaltyCard: "990123", maxmaDiscount: true, maxmaRetail: false }); odata.odataGet.mockRejectedValue(new Error("offline")); expect(await refreshMaxmaDiscount(1)).toBe(true); expect(db.customer.updateMany).not.toHaveBeenCalled();
    vi.clearAllMocks(); odata.odataConfigured.mockReturnValue(false); expect(await refreshMaxmaDiscount(1)).toBe(true); expect(odata.odataGet).not.toHaveBeenCalled(); expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
});
