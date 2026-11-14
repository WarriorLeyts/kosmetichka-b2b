import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } }));
const odata = vi.hoisted(() => ({ odataConfigured: () => true, odataAll: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("../scripts/onec-odata.js", () => odata);
import { matchPhoneCards, syncPhoneCards } from "./autoLinkCards";
import { oneCCardKinds } from "./loyaltyCardGroups";
const folders = [{ Ref_Key: "discounts", IsFolder: true, Description: "Максма Скидка" }, { Ref_Key: "retail", IsFolder: true, Description: "Максма Розница" }];
const owner = (phone: string, ref = "owner", parent = "discounts") => ({ Ref_Key: ref, Parent_Key: parent, НомерТелефонаДляПоиска: phone });
const card = (number: string, ref = "owner") => ({ КодКартыШтрихкод: number, ВладелецКарты_Key: ref });
const match = (owners: ReturnType<typeof owner>[], cards: ReturnType<typeof card>[]) => matchPhoneCards([...folders, ...owners], cards);
beforeEach(() => { vi.clearAllMocks(); db.customer.findFirst.mockResolvedValue(null); db.customer.updateMany.mockResolvedValue({ count: 1 }); });
describe("card kind and automatic binding come from 1C folders", () => {
  it.each(["8 (999) 123-45-67", "+7-999-123-45-67", "79991234567", "999-123-45-67"])("normalises %s and recognises a discount card without a 900 prefix", phone => {
    expect(match([owner(phone)], [card("123456")]).get("+79991234567")).toEqual({ number: "123456", discount: true });
  });
  it("a 900 card in Максма Розница remains a bonus card, and outside both folders is ignored", () => {
    expect(match([owner("89991234567", "owner", "retail")], [card("900123")]).get("+79991234567")).toEqual({ number: "900123", discount: false });
    expect(match([owner("89991234567", "owner", "other")], [card("900123")]).size).toBe(0);
  });
  it("prefers the unique newly issued discount card over a bonus card on the same phone", () => {
    expect(match([owner("89991234567", "bonus", "retail"), owner("89991234567", "paid")], [card("900123", "bonus"), card("123456", "paid")]).get("+79991234567")?.number).toBe("123456");
  });
  it("does not choose between two discount cards or different phone owners of the same card", () => {
    expect(match([owner("89991234567")], [card("123456"), card("654321")]).size).toBe(0);
    expect(match([owner("89991234567"), owner("89991111111", "other")], [card("123456"), card("123456", "other")]).size).toBe(0);
  });
  it("handles nested folders and rejects conflicting kinds/deleted owners", () => {
    const nested = [...folders, { Ref_Key: "sub", Parent_Key: "discounts", IsFolder: true }, owner("89991234567", "owner", "sub")];
    expect(oneCCardKinds(nested, [card("123456")]).get("123456")).toBe("discount");
    expect(oneCCardKinds([...folders, owner("89991234567"), owner("89991111111", "other", "retail")], [card("123456"), card("123456", "other")]).has("123456")).toBe(false);
    expect(oneCCardKinds([...folders, { ...owner("89991234567"), DeletionMark: true }], [card("123456")]).has("123456")).toBe(false);
  });
});
describe("automatic linking safeguards and refresh", () => {
  const seed = (customers: object[]) => {
    db.customer.findMany.mockResolvedValue(customers);
    odata.odataAll.mockImplementation(async entity => entity === "Catalog_Контрагенты" ? [...folders, owner("89991234567")] : [card("123456")]);
  };
  it("checks the unlink blacklist atomically when binding a unique card", async () => {
    seed([{ id: 1, phone: "89991234567", loyaltyCard: null, loyaltyUnlinkedCards: [] }]);
    await syncPhoneCards();
    expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, phone: "89991234567", loyaltyCard: null, NOT: { loyaltyUnlinkedCards: { has: "123456" } } }, data: { loyaltyCard: "123456", maxmaDiscount: true, maxmaRetail: false } });
  });
  it("does not auto-reattach a manually unlinked card", async () => {
    seed([{ id: 1, phone: "89991234567", loyaltyCard: null, loyaltyUnlinkedCards: ["123456"] }]);
    await syncPhoneCards(); expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
  it("still picks up a different newly issued card on the same phone", async () => {
    seed([{ id: 1, phone: "89991234567", loyaltyCard: null, loyaltyUnlinkedCards: ["old-card"] }]);
    await syncPhoneCards(); expect(db.customer.updateMany).toHaveBeenCalled();
  });
  it("refreshes a manually linked card's group even if the account phone differs", async () => {
    seed([{ id: 1, phone: "89991111111", loyaltyCard: "123456", maxmaDiscount: false, maxmaRetail: true }]);
    await syncPhoneCards(); expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, loyaltyCard: "123456" }, data: { maxmaDiscount: true, maxmaRetail: false } });
  });
  it("does not steal another account's card or choose an account with an ambiguous phone", async () => {
    seed([{ id: 1, phone: "89991234567", loyaltyCard: null }]); db.customer.findFirst.mockResolvedValue({ id: 2 });
    await syncPhoneCards(); expect(db.customer.updateMany).not.toHaveBeenCalled();
    seed([{ id: 1, phone: "89991234567" }, { id: 2, phone: "+7 (999) 123-45-67" }]); db.customer.findFirst.mockResolvedValue(null);
    await syncPhoneCards(); expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
});
