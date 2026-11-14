import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ id: 700 }));
const db = vi.hoisted(() => ({ customer: { findFirst: vi.fn(), update: vi.fn() } }));
const maxma = vi.hoisted(() => ({ findCard: vi.fn(), sendCode: vi.fn(), maxmaConfigured: () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../../_auth", () => ({ currentCustomerId: async () => state.id }));
vi.mock("@/lib/discountCard", () => ({ refreshMaxmaDiscount: vi.fn(async () => false) }));
vi.mock("@/lib/maxma", async (original) => ({ ...await original<typeof import("@/lib/maxma")>(), ...maxma }));
import { POST } from "./route";
const request = (body: object) => POST(new Request("https://shop.test/api/mobile/loyalty/link", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => {
  state.id++;
  vi.clearAllMocks();
  maxma.findCard.mockResolvedValue({ number: "900123", phone: "+79991234567", name: "Тест", bonuses: 100, pendingBonuses: 0, level: null, cashback: null });
  maxma.sendCode.mockResolvedValue({ code: "1234", expiresAt: Date.now() + 60000 });
  db.customer.findFirst.mockResolvedValue(null);
  db.customer.update.mockResolvedValue({});
});
describe("one card per site account", () => {
  it("rejects another account's card before sending an SMS", async () => {
    db.customer.findFirst.mockResolvedValue({ id: 1 });
    const response = await request({ query: "900123" });
    expect(response.status).toBe(409);
    expect(await response.json()).toHaveProperty("code", "card_already_linked");
    expect(maxma.sendCode).not.toHaveBeenCalled();
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("re-checks ownership after the SMS confirmation", async () => {
    expect((await request({ query: "900123" })).status).toBe(200);
    db.customer.findFirst.mockResolvedValue({ id: 1 });
    expect((await request({ code: "1234" })).status).toBe(409);
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("handles the unique-index race as a clear conflict, not a server error", async () => {
    expect((await request({ query: "900123" })).status).toBe(200);
    db.customer.update.mockRejectedValue({ code: "P2002" });
    const response = await request({ code: "1234" });
    expect(response.status).toBe(409);
    expect(await response.json()).toHaveProperty("code", "card_already_linked");
  });
  it("can confirm the same account's card without claiming a second account", async () => {
    expect((await request({ query: "900123" })).status).toBe(200);
    expect((await request({ code: "1234" })).status).toBe(200);
    expect(db.customer.findFirst).toHaveBeenLastCalledWith({ where: { loyaltyCard: "900123", NOT: { id: state.id } }, select: { id: true } });
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: state.id }, data: { loyaltyCard: "900123", maxmaDiscount: false } });
  });
});
