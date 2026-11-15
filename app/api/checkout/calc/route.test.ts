import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 1 }) }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn() }, product: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const loyalty = vi.hoisted(() => ({ maxmaConfigured: vi.fn(() => true), calcLoyalty: vi.fn() }));
vi.mock("@/lib/maxma", async (original) => ({ ...(await original<typeof import("@/lib/maxma")>()), ...loyalty }));
import { POST } from "./route";
import { checkoutCalcLimiter } from "@/lib/rateLimit";

const product = (id: number, prices: Record<string, number>) => ({ id, guid: `p${id}`, name: `Product ${id}`,
  stock: 500, wholesaleStock: 500, minOrderQty: 1, barcode: null,
  prices: Object.entries(prices).map(([priceType, price]) => ({ priceType, price })) });
const request = (extra = {}) => new Request("https://example.test/api/checkout/calc", {
  method: "POST", body: JSON.stringify({ items: [{ id: 1, quantity: 100 }, { id: 2, quantity: 100 }], ...extra }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-15T12:00:00+03:00"));
  checkoutCalcLimiter.reset("checkout:1");
  loyalty.maxmaConfigured.mockReturnValue(true);
  db.customer.findUnique.mockResolvedValue({ id: 1, priceType: "wholesale", loyaltyCard: null });
  db.product.findMany.mockResolvedValue([
    product(1, { retail: 1100, wholesale: 900, big_wholesale: 800 }),
    product(2, { retail: 300, wholesale: 250, big_wholesale: 220, promo_big_wholesale: 200 }),
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe("checkout campaign totals", () => {
  it("returns the automatic discount even without a loyalty card or promocode", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ subtotal: 100000, total: 97600, priceTier: "big_wholesale",
      wholesalePromo: { percent: 3, eligibleSubtotal: 80000, discount: 2400 }, promo: null });
    expect(loyalty.calcLoyalty).not.toHaveBeenCalled();
  });
  it("keeps the automatic discount when MAXMA is unavailable", async () => {
    loyalty.maxmaConfigured.mockReturnValue(false);
    const data = await (await POST(request({ promocode: "CODE" }))).json();
    expect(data.total).toBe(97600);
    expect(data.wholesalePromo.discount).toBe(2400);
    expect(data.promoError).toBeTruthy();
  });
  it("passes net line amounts to MAXMA and subtracts its promo only once", async () => {
    loyalty.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 100, name: "Code" }, bonuses: null });
    const data = await (await POST(request({ promocode: "CODE" }))).json();
    expect(data.total).toBe(97500);
    const lines = loyalty.calcLoyalty.mock.calls[0][0].lines;
    expect(lines[0].total).toBe(77600);
    expect(lines[1].total).toBe(20000);
  });
});

describe("card purchase quotes", () => {
  it("agrees with order creation, including the fixed 990 price rather than catalogue prices", async () => {
    db.customer.findUnique.mockResolvedValue({ id: 1, priceType: "retail", phone: "89991234567", loyaltyCard: null });
    db.product.findMany.mockResolvedValue([product(1, { retail: 1200, discount: 1000 }), { ...product(3, { retail: 1, discount: 500 }), name: "Карта Косметичка", stock: 0 }]);
    const r = await POST(request({ items: [{ id: 1, quantity: 2 }, { id: 3, quantity: 1, cardRegistration: { fullName: "Иванова Анна", birthDate: "01.01.1990" } }] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ subtotal: 2990, total: 2990, priceTier: "discount" });
  });
});

describe("restored retail bonus spending", () => {
  it.each(["retail", "discount"])("shows bonus accrual and caps %s spending at the 1000 minimum", async (priceType) => {
    db.customer.findUnique.mockResolvedValue({ id: 1, priceType, phone: "89991234567", loyaltyCard: "9000123", maxmaRetail: true });
    db.product.findMany.mockResolvedValue([product(1, { retail: 1500, discount: 1500 })]);
    loyalty.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 900, maxToApply: 900, applied: 0, collected: 45 } });
    const res = await POST(request({ items: [{ id: 1, quantity: 1 }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 1500, bonuses: { canSpend: true, balance: 900, maxToApply: 500, applied: 0, collected: 45 } });
  });
  it("recalculates excess spending after a promo code so the total remains at least 1000", async () => {
    db.customer.findUnique.mockResolvedValue({ id: 1, priceType: "retail", phone: "89991234567", loyaltyCard: "2000123", maxmaRetail: true });
    db.product.findMany.mockResolvedValue([product(1, { retail: 1500 })]);
    const bonus = { balance: 900, maxToApply: 900, collected: 30 };
    const promo = { applied: true, discount: 100, name: "Code" };
    loyalty.calcLoyalty.mockResolvedValueOnce({ promo, bonuses: { ...bonus, applied: 800 } }).mockResolvedValueOnce({ promo, bonuses: { ...bonus, applied: 400 } });
    const res = await POST(request({ items: [{ id: 1, quantity: 1 }], applyBonuses: 800, promocode: "CODE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 1000, bonuses: { canSpend: true, maxToApply: 400, applied: 400 } });
    expect(loyalty.calcLoyalty).toHaveBeenLastCalledWith(expect.objectContaining({ applyBonuses: 400 }));
  });
  it("keeps wholesale bonus spending forbidden", async () => {
    db.customer.findUnique.mockResolvedValue({ id: 1, priceType: "wholesale", loyaltyCard: "9000123", maxmaRetail: true });
    const res = await POST(request({ applyBonuses: 100 }));
    expect(res.status).toBe(400);
    expect(loyalty.calcLoyalty).not.toHaveBeenCalled();
  });
});
