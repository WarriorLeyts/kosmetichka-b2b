import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } }));
const odata = vi.hoisted(() => ({ odataConfigured: () => true, odataAll: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("../scripts/onec-odata.js", () => odata);
import { matchPhoneCards, syncPhoneCards } from "./autoLinkCards";
import { maxmaPhone } from "./maxma";

const owner = (phone: string, ref = "owner", extra = {}) => ({ Ref_Key: ref, НомерТелефонаДляПоиска: phone, ...extra });
const card = (number: string, ref = "owner") => ({ КодКартыШтрихкод: number, ВладелецКарты_Key: ref });

describe("phone-matched cash-desk cards", () => {
  it.each(["8 (999) 123-45-67", "+7-999-123-45-67", "79991234567", "999-123-45-67"])("normalises %s without changing subscriber digits", (phone) => {
    const normal = maxmaPhone(phone);
    expect(normal).toBe("+79991234567");
    expect(matchPhoneCards([owner(phone)], [card("900123")]).get(normal!)).toEqual({ number: "900123", discount: true });
  });
  it.each(["123", "999123456", "799912345678", "not a phone"])("does not guess missing digits in %s", (phone) => {
    expect(matchPhoneCards([owner(phone)], [card("900123")]).size).toBe(0);
  });
  it("upgrades a bonus card on the same phone to the unique discount card", () => {
    const matches = matchPhoneCards([owner("89991234567")], [card("990000"), card("900000")]);
    expect(matches.get("+79991234567")?.number).toBe("900000");
  });
  it("recognises the configured 1С group even without the 900 prefix", () => {
    expect(matchPhoneCards([{ Ref_Key: "discounts", IsFolder: true, Description: "Максма Скидка" }, owner("89991234567", "owner", { Parent_Key: "discounts" })], [card("123456")]).get("+79991234567")?.discount).toBe(true);
  });
  it("does not link a card number assigned to two different phones in 1С", () => {
    const matches = matchPhoneCards([owner("89991234567"), owner("89991111111", "another")], [card("900001"), card("900001", "another")]);
    expect(matches.size).toBe(0);
  });
  it("leaves ambiguous cards and a different phone unlinked", () => {
    const matches = matchPhoneCards([owner("89991234567"), owner("89991111111", "another")], [card("900001"), card("900002"), card("990001", "another")]);
    expect(matches.has("+79991234567")).toBe(false);
    expect(matches.has("+79992222222")).toBe(false);
    expect(matches.get("+79991111111")).toEqual({ number: "990001", discount: false });
  });
});

describe("automatic linking safeguards", () => {
  it("links the unique card using a conditional update on the unchanged account phone", async () => {
    db.customer.findMany.mockResolvedValue([{ id: 1, phone: "8 (999) 123-45-67", loyaltyCard: null, maxmaDiscount: false }]);
    db.customer.findFirst.mockResolvedValue(null);
    odata.odataAll.mockImplementation(async (entity) => entity === "Catalog_Контрагенты" ? [owner("+7-999-123-45-67")] : [card("900001")]);
    db.customer.updateMany.mockClear();
    await syncPhoneCards();
    expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, phone: "8 (999) 123-45-67", loyaltyCard: null }, data: { loyaltyCard: "900001", maxmaDiscount: true } });
  });
  it("does not steal a card already linked to another account", async () => {
    db.customer.findMany.mockResolvedValue([{ id: 1, phone: "89991234567", loyaltyCard: null, maxmaDiscount: false }]);
    db.customer.findFirst.mockResolvedValue({ id: 2 });
    db.customer.updateMany.mockClear();
    await syncPhoneCards();
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
  it("does not choose between accounts that have equivalent formatted phones", async () => {
    db.customer.findMany.mockResolvedValue([{ id: 1, phone: "89991234567" }, { id: 2, phone: "+7 (999) 123-45-67" }]);
    db.customer.findFirst.mockResolvedValue(null);
    db.customer.updateMany.mockClear();
    await syncPhoneCards();
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
});
