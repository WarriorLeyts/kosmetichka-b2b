import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ product: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { customerStock, isWholesaleType, WHOLESALE_MIN_STOCK } from "./utils";
import { priceOrder } from "./orderPricing";
import { wholesaleAvailable } from "../scripts/onec-helpers.js";

const SHOP = "bd887c46-1148-11f1-80cf-10ffe0cbb38c";
const STOCK = "a5ecdd7f-0fca-11f1-a212-d45d64282814";

describe("wholesaleAvailable: the shop keeps 12, the warehouse gives everything", () => {
  it("examples of the owner", () => {
    expect(wholesaleAvailable(43, [{ guid: SHOP, qty: 11 }, { guid: STOCK, qty: 32 }])).toBe(32);
    expect(wholesaleAvailable(5, [{ guid: STOCK, qty: 5 }])).toBe(5);
    expect(wholesaleAvailable(20, [{ guid: SHOP, qty: 20 }])).toBe(8);
    expect(wholesaleAvailable(12, [{ guid: SHOP, qty: 12 }])).toBe(0);
    expect(wholesaleAvailable(30, [{ guid: SHOP, qty: 20 }, { guid: STOCK, qty: 10 }])).toBe(18);
  });
  it("no split: the whole stock is the shop's", () => {
    expect(wholesaleAvailable(15, null)).toBe(3);
    expect(wholesaleAvailable(7, null)).toBe(0);
  });
});

describe("customerStock", () => {
  it("wholesalers: what they may order (wholesaleStock)", () => {
    expect(WHOLESALE_MIN_STOCK).toBe(12);
    expect(customerStock(43, "wholesale", 32)).toBe(32);
    expect(customerStock(5, "big_wholesale", 5)).toBe(5);
    expect(customerStock(12, "wholesale", 0)).toBe(0);
    expect(customerStock(null, "wholesale", null)).toBe(0);
  });
  it("retail / card / no type: the real stock", () => {
    expect(customerStock(3, "retail", 0)).toBe(3);
    expect(customerStock(3, "discount", 0)).toBe(3);
    expect(customerStock(3, null, 0)).toBe(3);
    expect(isWholesaleType("retail")).toBe(false);
  });
});

describe("priceOrder: wholesalers only what they may order", () => {
  const product = (stock: number, wholesaleStock = Math.max(0, stock - 12)) => ({
    id: 1,
    name: "Крем",
    guid: "g1",
    barcode: null,
    stock,
    wholesaleStock,
    minOrderQty: 1,
    prices: [
      { priceType: "retail", price: 500 },
      { priceType: "wholesale", price: 300 },
    ],
  });
  beforeEach(() => db.product.findMany.mockReset());

  it("a wholesaler can't order what the shop must keep (12 in the shop, no warehouse)", async () => {
    db.product.findMany.mockResolvedValue([product(12)]);
    await expect(priceOrder({ priceType: "wholesale" }, [{ id: 1, quantity: 30 }])).rejects.toThrow("нет в наличии");
  });
  it("only on the warehouse (5): fine for a wholesaler", async () => {
    db.product.findMany.mockResolvedValue([product(5, 5)]);
    const { lines } = await priceOrder({ priceType: "wholesale" }, [{ id: 1, quantity: 30 }]);
    expect(lines).toHaveLength(1);
  });
  it("retail customers are not affected", async () => {
    db.product.findMany.mockResolvedValue([product(2)]);
    const { lines } = await priceOrder({ priceType: "retail" }, [{ id: 1, quantity: 1 }]);
    expect(lines[0].price).toBe(500);
  });
});
