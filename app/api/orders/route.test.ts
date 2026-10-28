/**
 * Order scenarios end to end through POST /api/orders (DB, MAXMA, mail mocked):
 * which prices each customer type gets, the wholesale minimums, bonuses only for retail buyers,
 * promo codes, and the 409 when MAXMA can't reserve bonuses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "auth_token" ? { value: "t" } : undefined) }),
}));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: vi.fn(async () => ({ id: 1 })) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => {}) }));

const db = vi.hoisted(() => ({
  customer: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  product: { findMany: vi.fn() },
  order: { create: vi.fn(), update: vi.fn() },
  orderItem: { findMany: vi.fn(async () => []), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const maxma = vi.hoisted(() => ({
  maxmaConfigured: vi.fn(() => true),
  calcLoyalty: vi.fn(),
  setLoyaltyOrderQuery: vi.fn(),
}));
vi.mock("@/lib/maxma", async (orig) => ({ ...(await orig<typeof import("@/lib/maxma")>()), ...maxma }));

const queue = vi.hoisted(() => ({ enqueueMaxmaTask: vi.fn(async () => {}), runOrderMaxmaTasks: vi.fn(async () => ({})) }));
vi.mock("@/lib/maxmaQueue", () => queue);

import { POST } from "./route";
import { orderCreationLimiter } from "@/lib/rateLimit";

// one product: retail 1 120, discount 1 005, wholesale 727, big wholesale 671
const product = (id: number, prices: Record<string, number>) => ({
  id,
  guid: `g${id}`,
  name: `Товар ${id}`,
  barcode: null,
  minOrderQty: 1,
  prices: Object.entries(prices).map(([priceType, price]) => ({ priceType, price })),
});
const blush = product(1, { retail: 1120, discount: 1005, wholesale: 727, big_wholesale: 671 });
const noWholesale = product(2, { retail: 400, discount: 400, wholesale: 0 });

const customer = (priceType: string, extra: object = {}) => ({
  id: 1, name: "Тест", phone: "89001234567", email: null, companyName: null, loyaltyCard: null, priceType, address: "Махачкала, ул. Ленина, 1", ...extra,
});

const order = (body: object) =>
  POST(new Request("https://x/api/orders", { method: "POST", body: JSON.stringify(body) }));

let created: { data: { total: number; priceType: string; items: { create: { price: number; quantity: number }[] }; bonusesApplied?: number } } | null;

beforeEach(() => {
  vi.clearAllMocks();
  orderCreationLimiter.reset("order:1");
  created = null;
  db.product.findMany.mockResolvedValue([blush, noWholesale]);
  db.order.create.mockImplementation(async (a) => {
    created = a;
    return { id: 501, total: a.data.total, discount: a.data.discount ?? 0, bonusesApplied: a.data.bonusesApplied ?? 0, bonusesCollected: a.data.bonusesCollected ?? 0, items: [{ id: 1 }] };
  });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 500, maxToApply: 300, applied: 0, collected: 50 }, bonusLines: [0] });
});

describe("prices by customer type", () => {
  it.each([
    ["retail", 1120],
    ["discount", 1005],
    ["wholesale", 727],
    ["big_wholesale", 671],
  ])("%s pays %i per item", async (type, price) => {
    db.customer.findUnique.mockResolvedValue(customer(type));
    const qty = type === "big_wholesale" ? 80 : type === "wholesale" ? 7 : 1; // above the minimums
    const r = await order({ items: [{ id: 1, quantity: qty }] });
    expect(r.status).toBe(200);
    expect(created?.data.items.create[0].price).toBe(price);
    expect(created?.data.total).toBe(price * qty);
    expect(created?.data.priceType).toBe(type);
  });

  it("wholesale without its own price (0 from 1C) pays retail, not 0", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale"));
    const r = await order({ items: [{ id: 1, quantity: 7 }, { id: 2, quantity: 1 }] });
    expect(r.status).toBe(200);
    expect(created?.data.items.create[1].price).toBe(400);
  });
});

describe("minimum order", () => {
  it("wholesale below 5 000 is refused", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale"));
    const r = await order({ items: [{ id: 1, quantity: 6 }] }); // 4 362
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("min_order");
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("big wholesale below 50 000 is refused, from 50 000 accepted", async () => {
    db.customer.findUnique.mockResolvedValue(customer("big_wholesale"));
    expect((await order({ items: [{ id: 1, quantity: 74 }] })).status).toBe(400); // 49 654
    expect((await order({ items: [{ id: 1, quantity: 75 }] })).status).toBe(200); // 50 325
  });

  it("retail has no minimum", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    expect((await order({ items: [{ id: 2, quantity: 1 }] })).status).toBe(200);
  });
});

describe("shop address (опт, крупный опт)", () => {
  it("a wholesale account without an address can't order without giving it", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { address: null }));
    const r = await order({ items: [{ id: 1, quantity: 7 }] });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("address_required");
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("the address given at checkout is saved to the profile and the order goes through", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { address: null }));
    const r = await order({ items: [{ id: 1, quantity: 7 }], address: "  Махачкала,  ул. Гагарина 5 " });
    expect(r.status).toBe(200);
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { address: "Махачкала, ул. Гагарина 5" } });
  });

  it("retail doesn't need it", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail", { address: null }));
    expect((await order({ items: [{ id: 2, quantity: 1 }] })).status).toBe(200);
  });
});

describe("MAXMA bonuses", () => {
  it("wholesale with a card can't spend bonuses", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { loyaltyCard: "2000123" }));
    const r = await order({ items: [{ id: 1, quantity: 7 }], applyBonuses: 100 });
    expect(r.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it.each(["retail", "discount"])("%s with a card spends bonuses (reserved before the order is saved)", async (type) => {
    db.customer.findUnique.mockResolvedValue(customer(type, { loyaltyCard: "2000123" }));
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 500, maxToApply: 300, applied: 100, collected: 40 }, bonusLines: [100] });
    maxma.setLoyaltyOrderQuery.mockResolvedValue({ applied: 100, collected: 40, bonusRows: [100] });
    const r = await order({ items: [{ id: 1, quantity: 1 }], applyBonuses: 100 });
    expect(r.status).toBe(200);
    expect(maxma.setLoyaltyOrderQuery).toHaveBeenCalledTimes(1);
    expect(created?.data.bonusesApplied).toBe(100);
    expect((await r.json()).total).toBe((type === "retail" ? 1120 : 1005) - 100);
  });

  it("MAXMA not answering on reservation → 409, order not saved, cancel queued", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail", { loyaltyCard: "2000123" }));
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 500, maxToApply: 300, applied: 100, collected: 40 }, bonusLines: [100] });
    maxma.setLoyaltyOrderQuery.mockRejectedValue(new Error("timeout"));
    const r = await order({ items: [{ id: 1, quantity: 1 }], applyBonuses: 100 });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("bonuses_unavailable");
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(501, "cancel", null, { run: false });
  });

  it("wholesale with a card: MAXMA calculation without the card (no accrual)", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { loyaltyCard: "2000123" }));
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: null, bonusLines: [0] });
    const r = await order({ items: [{ id: 1, quantity: 7 }] });
    expect(r.status).toBe(200);
    expect(created?.data.bonusesApplied).toBeUndefined();
  });
});

describe("promo code", () => {
  it("applied promo reduces the total and is registered in MAXMA", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 112, lines: [112] }, bonuses: null, bonusLines: [0] });
    const r = await order({ items: [{ id: 1, quantity: 1 }], promocode: "APP" });
    expect(r.status).toBe(200);
    expect(created?.data.total).toBe(1120 - 112);
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(501, "set", expect.anything());
  });

  it("promo not valid → 400, no order", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: false, discount: 0, lines: [0], error: "истёк" }, bonuses: null, bonusLines: [0] });
    const r = await order({ items: [{ id: 1, quantity: 1 }], promocode: "OLD" });
    expect(r.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });
});
