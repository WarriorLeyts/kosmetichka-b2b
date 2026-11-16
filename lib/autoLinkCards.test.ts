import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } }));
const maxma = vi.hoisted(() => ({ findCard: vi.fn(), maxmaConfigured: vi.fn() }));
const group = vi.hoisted(() => ({ refreshMaxmaDiscount: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("./maxma", async (original) => ({ ...await original<typeof import("./maxma")>(), ...maxma }));
vi.mock("./discountCard", () => group);
import { syncCustomerCard, syncPhoneCards } from "./autoLinkCards";

const customer = (extra = {}) => ({ id: 1, phone: "89991234567", loyaltyCard: null, maxmaDiscount: false, priceType: "retail", isActive: true, isApproved: true, ...extra });
beforeEach(() => {
  vi.resetAllMocks();
  db.customer.findMany.mockResolvedValue([customer()]);
  db.customer.findFirst.mockResolvedValue(null);
  db.customer.updateMany.mockResolvedValue({ count: 1 });
  maxma.maxmaConfigured.mockReturnValue(true);
  maxma.findCard.mockResolvedValue({ number: "990123", phone: "+7 (999) 123-45-67" });
  group.refreshMaxmaDiscount.mockResolvedValue(false);
});

describe("MAXMA phone linking", () => {
  it.each(["8 (999) 123-45-67", "+7-999-123-45-67", "79991234567", "9991234567"])("links either card type by the full normalised phone %s", async (phone) => {
    db.customer.findMany.mockResolvedValue([customer({ phone })]);
    await syncCustomerCard(1);
    expect(maxma.findCard).toHaveBeenCalledWith({ phoneNumber: "+79991234567" });
    expect(db.customer.updateMany).toHaveBeenCalledWith({ where: { id: 1, phone, loyaltyCard: null, priceType: "retail", isActive: true, isApproved: true }, data: { loyaltyCard: "990123", maxmaDiscount: false } });
    expect(group.refreshMaxmaDiscount).toHaveBeenCalledWith(1);
  });
  it("checks the group after saving the card, independently of its prefix", async () => {
    maxma.findCard.mockResolvedValue({ number: "900123", phone: "+79991234567" });
    group.refreshMaxmaDiscount.mockImplementation(async () => {
      expect(db.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { loyaltyCard: "900123", maxmaDiscount: false } }));
      return true;
    });
    await syncCustomerCard(1);
    expect(group.refreshMaxmaDiscount).toHaveBeenCalledWith(1);
  });
  it.each([null, { number: "123", phone: null }, { number: "123", phone: "+79991111111" }])("does not link missing or mismatched MAXMA ownership (%j)", async (card) => {
    maxma.findCard.mockResolvedValue(card);
    await syncCustomerCard(1);
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
  it("does not link a card claimed by another account", async () => {
    db.customer.findFirst.mockResolvedValue({ id: 2 });
    await syncCustomerCard(1);
    expect(db.customer.updateMany).not.toHaveBeenCalled();
  });
  it("does not choose between equivalent phones on different accounts", async () => {
    db.customer.findMany.mockResolvedValue([customer(), customer({ id: 2, phone: "+7 (999) 123-45-67", isActive: false })]);
    await syncPhoneCards();
    expect(maxma.findCard).not.toHaveBeenCalled();
  });
  it.each([{ isApproved: false }, { isActive: false }, { priceType: "wholesale" }, { phone: "123" }])("skips ineligible accounts %j", async (extra) => {
    db.customer.findMany.mockResolvedValue([customer(extra)]);
    await syncCustomerCard(1);
    expect(maxma.findCard).not.toHaveBeenCalled();
  });
  it("preserves an existing card and refreshes its group without replacing its number", async () => {
    db.customer.findMany.mockResolvedValue([customer({ loyaltyCard: "990123" })]);
    await syncPhoneCards();
    expect(maxma.findCard).not.toHaveBeenCalled();
    expect(db.customer.updateMany).not.toHaveBeenCalled();
    expect(group.refreshMaxmaDiscount).toHaveBeenCalledWith(1);
  });
  it("retries after a MAXMA failure and continues with other accounts", async () => {
    db.customer.findMany.mockResolvedValue([customer(), customer({ id: 2, phone: "89991111111" })]);
    maxma.findCard.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ number: "555", phone: "+79991111111" });
    await syncPhoneCards();
    expect(db.customer.updateMany).toHaveBeenCalledTimes(1);
    db.customer.findMany.mockResolvedValue([customer()]);
    await syncPhoneCards();
    expect(db.customer.updateMany).toHaveBeenCalledTimes(2);
  });
  it("keeps the saved card when 1C cannot classify it yet", async () => {
    group.refreshMaxmaDiscount.mockResolvedValue(false);
    await syncCustomerCard(1);
    expect(db.customer.updateMany).toHaveBeenCalledTimes(1);
  });
  it("tolerates a unique constraint race without refreshing another account's card", async () => {
    db.customer.updateMany.mockRejectedValue({ code: "P2002" });
    await expect(syncCustomerCard(1)).resolves.toBeUndefined();
    expect(group.refreshMaxmaDiscount).not.toHaveBeenCalled();
  });
  it("does not refresh a card if the account changed during discovery", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 0 });
    await syncCustomerCard(1);
    expect(group.refreshMaxmaDiscount).not.toHaveBeenCalled();
  });
  it("does not query MAXMA when it is unconfigured", async () => {
    maxma.maxmaConfigured.mockReturnValue(false);
    await syncCustomerCard(1);
    expect(maxma.findCard).not.toHaveBeenCalled();
  });
});
