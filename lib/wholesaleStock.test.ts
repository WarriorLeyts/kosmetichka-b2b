import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ product: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { customerStock, isWholesaleType, WHOLESALE_MIN_STOCK } from "./utils";
import { priceOrder } from "./orderPricing";

describe("customerStock", () => {
  it("wholesalers: fewer than 12 = out of stock", () => {
    expect(WHOLESALE_MIN_STOCK).toBe(12);
    expect(customerStock(11, "wholesale")).toBe(0);
    expect(customerStock(5, "big_wholesale")).toBe(0);
    expect(customerStock(null, "wholesale")).toBe(0);
    expect(customerStock(12, "wholesale")).toBe(12);
    expect(customerStock(40, "big_wholesale")).toBe(40);
  });
  it("retail / card / no type: the real stock", () => {
    expect(customerStock(3, "retail")).toBe(3);
    expect(customerStock(3, "discount")).toBe(3);
    expect(customerStock(3, null)).toBe(3);
    expect(isWholesaleType("retail")).toBe(false);
  });
});

describe("priceOrder: the 12-piece rule", () => {
  const product = (stock: number) => ({
    id: 1,
    name: "Крем",
    guid: "g1",
    barcode: null,
    stock,
    minOrderQty: 1,
    prices: [
      { priceType: "retail", price: 500 },
      { priceType: "wholesale", price: 300 },
    ],
  });
  beforeEach(() => db.product.findMany.mockReset());

  it("a wholesaler can't order a product with fewer than 12 in the shops", async () => {
    db.product.findMany.mockResolvedValue([product(11)]);
    await expect(priceOrder({ priceType: "wholesale" }, [{ id: 1, quantity: 30 }])).rejects.toThrow("нет в наличии");
  });
  it("12 and more: fine for a wholesaler", async () => {
    db.product.findMany.mockResolvedValue([product(12)]);
    const { lines } = await priceOrder({ priceType: "wholesale" }, [{ id: 1, quantity: 30 }]);
    expect(lines).toHaveLength(1);
  });
  it("retail customers are not affected", async () => {
    db.product.findMany.mockResolvedValue([product(2)]);
    const { lines } = await priceOrder({ priceType: "retail" }, [{ id: 1, quantity: 1 }]);
    expect(lines[0].price).toBe(500);
  });
});
