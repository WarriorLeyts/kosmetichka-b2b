/**
 * Order scenarios end to end through POST /api/orders (DB, MAXMA, mail mocked):
 * which prices each customer type gets, the wholesale minimums, bonuses only for retail buyers,
 * promo codes, and the 409 when MAXMA can't reserve bonuses.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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
// bonus spending is switched off for now (lib/siteMode.ts); the spending path itself stays tested
const flags = vi.hoisted(() => ({ bonusOff: false }));
vi.mock("@/lib/siteMode", async (orig) => ({ ...(await orig<typeof import("@/lib/siteMode")>()), bonusSpendOff: () => flags.bonusOff }));

import { POST } from "./route";
import { orderCreationLimiter } from "@/lib/rateLimit";

// one product: retail 1 120, discount 1 005, wholesale 727, big wholesale 671
const product = (id: number, prices: Record<string, number>) => ({
  id,
  guid: `g${id}`,
  name: `Товар ${id}`,
  barcode: null,
  minOrderQty: 1,
  stock: 500,
  wholesaleStock: 500,
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
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-12T12:00:00+03:00"));
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

afterEach(() => vi.restoreAllMocks());

describe("Светлая пятница + ОПТ", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-13T12:00:00+03:00"));
  });

  it("stores a 3% discount on 80 000 ₽, while 20 000 ₽ of shock items qualify for the 100 000 ₽ threshold", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale"));
    db.product.findMany.mockResolvedValue([
      product(1, { retail: 1100, wholesale: 900, big_wholesale: 800 }),
      product(2, { retail: 300, wholesale: 250, big_wholesale: 220, promo_big_wholesale: 200 }),
    ]);
    const r = await order({ items: [{ id: 1, quantity: 100 }, { id: 2, quantity: 100 }] });
    expect(r.status).toBe(200);
    expect(created?.data.total).toBe(97_600);
    const data = created?.data as unknown as { discount: number; priceTier: string; items: { create: { price: number; discount?: number }[] } };
    expect(data.priceTier).toBe("big_wholesale");
    expect(data.discount).toBe(2400);
    expect(data.items.create[0]).toMatchObject({ price: 800, discount: 2400 });
    expect(data.items.create[1].price).toBe(200);
    expect(data.items.create[1].discount ?? 0).toBe(0);
  });

  it("retail and discount-card buyers get Акция Розница", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    db.product.findMany.mockResolvedValue([product(1, { retail: 490, discount: 440, promo_retail: 399 })]);
    const r = await order({ items: [{ id: 1, quantity: 3 }] });
    expect(r.status).toBe(200);
    expect(created?.data.total).toBe(1197);
    expect(created?.data.items.create[0].price).toBe(399);
  });

  it("restores regular prices and the 50 000 ₽ threshold after Moscow midnight", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-12-01T00:00:00+03:00"));
    db.customer.findUnique.mockResolvedValue(customer("wholesale"));
    db.product.findMany.mockResolvedValue([product(1, { retail: 490, wholesale: 190, big_wholesale: 180, promo_wholesale: 168, promo_big_wholesale: 168 })]);
    const r = await order({ items: [{ id: 1, quantity: 150 }] });
    expect(r.status).toBe(200);
    expect(created?.data.total).toBe(28_500);
  });
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

describe("«Опт»: the price by the order sum (no minimum)", () => {
  type Created = { data: { priceTier?: string; total: number; items: { create: { price: number }[] } } };
  it.each([
    [6, "discount", 1005], //   6 × 727 = 4 362 < 5 000 → discount price
    [7, "wholesale", 727], //   7 × 727 = 5 089
    [74, "wholesale", 727], // 74 × 671 = 49 654 < 50 000
    [75, "big_wholesale", 671], // 75 × 671 = 50 325
  ])("%i pcs → %s (%i per item)", async (qty, tier, price) => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale"));
    const r = await order({ items: [{ id: 1, quantity: qty }] });
    expect(r.status).toBe(200);
    const c = created as unknown as Created;
    expect(c.data.items.create[0].price).toBe(price);
    expect(c.data.priceTier).toBe(tier);
    expect(c.data.total).toBe(price * qty);
  });

  it("big wholesale set by the manager: big prices at any sum", async () => {
    db.customer.findUnique.mockResolvedValue(customer("big_wholesale"));
    expect((await order({ items: [{ id: 1, quantity: 1 }] })).status).toBe(200);
    expect(created?.data.items.create[0].price).toBe(671);
  });

  it("retail orders below 1000 are rejected", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    expect((await order({ items: [{ id: 2, quantity: 1 }] })).status).toBe(400);
    expect(created).toBeNull();
  });
});

describe("delivery: «Заберу в магазине» or an address (not required)", () => {
  type C = { data: { deliveryType?: string; deliveryAddress?: string | null } };
  it("a wholesale account without an address orders all the same", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { address: null }));
    const r = await order({ items: [{ id: 1, quantity: 7 }] });
    expect(r.status).toBe(200);
    expect((created as unknown as C).data).toMatchObject({ deliveryType: "delivery", deliveryAddress: null });
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it("pickup: no address on the order", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    expect((await order({ items: [{ id: 2, quantity: 3 }], pickup: true, address: "что-то" })).status).toBe(200);
    expect((created as unknown as C).data).toMatchObject({ deliveryType: "pickup", deliveryAddress: null });
  });

  it("delivery: the given address, else the profile one", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    await order({ items: [{ id: 2, quantity: 3 }], address: "  Грозный,  ул. Мира 3 " });
    expect((created as unknown as C).data.deliveryAddress).toBe("Грозный, ул. Мира 3");
    await order({ items: [{ id: 2, quantity: 3 }] });
    expect((created as unknown as C).data.deliveryAddress).toBe("Махачкала, ул. Ленина, 1");
  });
});

describe("MAXMA bonuses", () => {
  it("wholesale with a card can't spend bonuses", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { loyaltyCard: "9000123" }));
    const r = await order({ items: [{ id: 1, quantity: 7 }], applyBonuses: 100 });
    expect(r.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it.each(["retail", "discount"])("%s with a card spends bonuses (reserved before the order is saved)", async (type) => {
    db.customer.findUnique.mockResolvedValue(customer(type, { loyaltyCard: "9000123" }));
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 500, maxToApply: 300, applied: 100, collected: 40 }, bonusLines: [100] });
    maxma.setLoyaltyOrderQuery.mockResolvedValue({ applied: 100, collected: 40, bonusRows: [100] });
    const r = await order({ items: [{ id: 1, quantity: 2 }], applyBonuses: 100 });
    expect(r.status).toBe(200);
    expect(maxma.setLoyaltyOrderQuery).toHaveBeenCalledTimes(1);
    expect(created?.data.bonusesApplied).toBe(100);
    // «Розница» with a linked card is priced at «Скидка по карте» (lib/siteMode.ts pricingCustomer)
    expect((await r.json()).total).toBe(2010 - 100);
  });

  it("bonus spending switched off → 400, nothing reserved; retail with a card still at the discount price", async () => {
    flags.bonusOff = true;
    try {
      db.customer.findUnique.mockResolvedValue(customer("retail", { loyaltyCard: "9000123" }));
      const r = await order({ items: [{ id: 1, quantity: 2 }], applyBonuses: 100 });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("Списание бонусов отключено");
      expect(maxma.setLoyaltyOrderQuery).not.toHaveBeenCalled();
      const ok = await order({ items: [{ id: 1, quantity: 1 }] });
      expect((await ok.json()).total).toBe(1005);
    } finally {
      flags.bonusOff = false;
    }
  });

  it("retail without a card → retail price", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    const r = await order({ items: [{ id: 1, quantity: 1 }] });
    expect((await r.json()).total).toBe(1120);
  });

  it("MAXMA not answering on reservation → 409, order not saved, cancel queued", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail", { loyaltyCard: "9000123" }));
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 500, maxToApply: 300, applied: 100, collected: 40 }, bonusLines: [100] });
    maxma.setLoyaltyOrderQuery.mockRejectedValue(new Error("timeout"));
    const r = await order({ items: [{ id: 1, quantity: 2 }], applyBonuses: 100 });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("bonuses_unavailable");
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(501, "cancel", null, { run: false });
  });

  it("wholesale with a card: MAXMA calculation without the card (no accrual)", async () => {
    db.customer.findUnique.mockResolvedValue(customer("wholesale", { loyaltyCard: "9000123" }));
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


describe("paid loyalty card", () => {
  const registration = { fullName: "Иванова Анна Сергеевна", birthDate: "15.03.1995" };
  const card = { ...product(3, { retail: 1000, discount: 1 }), name: "Карта Косметичка", stock: 0 };
  beforeEach(() => {
    db.customer.findUnique.mockResolvedValue(customer("retail"));
    db.product.findMany.mockResolvedValue([blush, card]);
  });
  it("card + goods: prices goods at discount, card at fixed 990, stores cashier data from the profile phone", async () => {
    const r = await order({ items: [{ id: 1, quantity: 2 }, { id: 3, quantity: 1, cardRegistration: registration }], comment: "Позвонить", phone: "+79999999999" });
    expect(r.status).toBe(200);
    expect(created?.data.total).toBe(1005 * 2 + 990);
    expect(created?.data.items.create[1]).toMatchObject({ price: 990, quantity: 1 });
    const data = created?.data as unknown as { comment: string; priceTier: string };
    expect(data.priceTier).toBe("discount");
    expect(data.comment).toContain("Позвонить");
    expect(data.comment).toContain(registration.fullName);
    expect(data.comment).toContain("15.03.1995");
    expect(data.comment).toContain("+79001234567");
    expect(data.comment).not.toContain("79999999999");
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("card-only order is 990 without a stock requirement or loyalty call", async () => {
    expect((await order({ items: [{ id: 3, quantity: 1, cardRegistration: registration }] })).status).toBe(200);
    expect(created?.data.total).toBe(990);
    expect(maxma.calcLoyalty).not.toHaveBeenCalled();
  });
  it("removing the card restores retail prices without changing the account", async () => {
    expect((await order({ items: [{ id: 1, quantity: 2 }] })).status).toBe(200);
    expect(created?.data.total).toBe(1120 * 2);
  });
  it.each([
    [{ id: 3, quantity: 2, cardRegistration: registration }],
    [{ id: 3, quantity: 1 }],
    [{ id: 3, quantity: 1, cardRegistration: { ...registration, birthDate: "31.02.1995" } }],
    [{ id: 1, quantity: 1, cardRegistration: registration }],
    [{ id: 3, quantity: 1, cardRegistration: registration }, { id: 3, quantity: 1, cardRegistration: registration }],
  ])("rejects invalid/forged card order %j", async (...items) => {
    expect((await order({ items })).status).toBe(400);
    expect(created).toBeNull();
  });
  it("existing discount card / wholesale customers cannot order another card", async () => {
    for (const who of [customer("retail", { loyaltyCard: "900123" }), customer("wholesale")]) {
      db.customer.findUnique.mockResolvedValue(who);
      expect((await order({ items: [{ id: 3, quantity: 1, cardRegistration: registration }] })).status).toBe(400);
    }
  });
  it("card receives no promotional discount even when it comes before the goods", async () => {
    maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 100, lines: [100] }, bonuses: null });
    const r = await order({ items: [{ id: 3, quantity: 1, cardRegistration: registration }, { id: 1, quantity: 1 }], promocode: "PROMO" });
    expect(r.status).toBe(200);
    expect(maxma.calcLoyalty.mock.calls[0][0].lines).toHaveLength(1);
    expect(maxma.calcLoyalty.mock.calls[0][0].lines[0].productName).toBe("Товар 1");
    expect(created?.data.total).toBe(990 + 1005 - 100);
    expect(created?.data.items.create[0]).not.toHaveProperty("discount");
    expect(created?.data.items.create[1]).toHaveProperty("discount", 100);
  });
});

describe("retail minimum with card-only exception", () => {
 it.each(["retail", "discount"])("%s rejects 999 and accepts exactly 1000", async (priceType) => {
  db.customer.findUnique.mockResolvedValue(customer(priceType));
  db.product.findMany.mockResolvedValue([product(1, { retail: 999, discount: 999 })]);
  let response = await order({ items: [{ id: 1, quantity: 1 }] });
  expect(response.status).toBe(400); expect(await response.json()).toHaveProperty("code", "minimum_order"); expect(created).toBeNull();
  db.product.findMany.mockResolvedValue([product(1, { retail: 1000, discount: 1000 })]);
  response = await order({ items: [{ id: 1, quantity: 1 }] }); expect(response.status).toBe(200);
 });
 it("a valid promo cannot bypass the final 1000 minimum", async () => {
  db.customer.findUnique.mockResolvedValue(customer("retail"));
  maxma.calcLoyalty.mockResolvedValue({ promo: { applied: true, discount: 200, lines: [200] }, bonuses: null, bonusLines: [0] });
  const response = await order({ items: [{ id: 1, quantity: 1 }], promocode: "CODE" });
  expect(response.status).toBe(400); expect(await response.json()).toHaveProperty("code", "minimum_order"); expect(created).toBeNull();
 });
});

describe("retail minimum after bonus reservation", () => {
  it("cancels the reservation if MAXMA changes it enough to put the order below 1000", async () => {
    db.customer.findUnique.mockResolvedValue(customer("retail", { loyaltyCard: "9000123" }));
    maxma.calcLoyalty.mockResolvedValue({ promo: null, bonuses: { balance: 1500, maxToApply: 1200, applied: 100, collected: 40 }, bonusLines: [100] });
    maxma.setLoyaltyOrderQuery.mockResolvedValue({ applied: 1200, collected: 20, bonusRows: [1200] });
    const response = await order({ items: [{ id: 1, quantity: 2 }], applyBonuses: 1200 });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("bonuses_unavailable");
    expect(queue.enqueueMaxmaTask).toHaveBeenCalledWith(501, "cancel", null, { run: false });
  });
});
