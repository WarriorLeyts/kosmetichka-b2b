import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn((a: unknown) => a) },
  orderItem: { update: vi.fn((a: unknown) => a) },
  product: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { orderTier, repriceOrder } from "./orderTier";

// one product: discount 1005, wholesale 727, big 671
const prices = [
  { priceType: "retail", price: 1120 },
  { priceType: "discount", price: 1005 },
  { priceType: "wholesale", price: 727 },
  { priceType: "big_wholesale", price: 671 },
];
const order = (qty: number, extra: object = {}) => ({
  id: 9, priceType: "wholesale", priceTier: "wholesale", customer: { priceType: "wholesale" },
  items: [{ id: 1, productId: 5, quantity: qty, price: 727 }],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([{ id: 5, prices }]);
});

describe("repriceOrder", () => {
  it("«Опт» falling under 5 000 → every line at the discount price", async () => {
    db.order.findUnique.mockResolvedValue(order(6)); // 6 × 727 = 4 362
    const r = await repriceOrder(9);
    expect(r?.to).toBe("discount");
    expect(r?.text).toContain("скидочной");
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { price: 1005, total: 6030 } });
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { priceTier: "discount" } });
  });

  it("the same tier → nothing changes", async () => {
    db.order.findUnique.mockResolvedValue(order(7));
    expect(await repriceOrder(9)).toBeNull();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("reaching 50 000 → big wholesale", async () => {
    db.order.findUnique.mockResolvedValue(order(75));
    expect((await repriceOrder(9))?.to).toBe("big_wholesale");
    expect(db.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { price: 671, total: 671 * 75 } });
  });

  it("other customer types are never re-priced", async () => {
    db.order.findUnique.mockResolvedValue(order(1, { priceType: "big_wholesale", priceTier: null, customer: { priceType: "big_wholesale" } }));
    expect(await repriceOrder(9)).toBeNull();
    db.order.findUnique.mockResolvedValue(order(1, { priceType: "retail", priceTier: null, customer: { priceType: "retail" } }));
    expect(await repriceOrder(9)).toBeNull();
  });

  it("old orders (no tier saved) count as their customer type", () => {
    expect(orderTier({ priceTier: null, priceType: "wholesale" })).toBe("wholesale");
    expect(orderTier({ priceTier: "discount", priceType: "wholesale" })).toBe("discount");
  });
});
