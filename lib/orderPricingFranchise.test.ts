vi.mock("@/lib/brandVisibility", () => ({ visibleBrandsWhere: async () => ({}) }));
import { beforeEach, expect, it, vi } from "vitest";
import { LEGACY_CAMPAIGN } from "./campaign";
const db = vi.hoisted(() => ({ product: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("./campaignSettings", () => ({ getCampaign: async () => LEGACY_CAMPAIGN }));
import { priceOrder } from "./orderPricing";

const product = { id: 1, guid: "p1", name: "Крем", barcode: "123", stock: 100, wholesaleStock: 100, minOrderQty: 1, variants: [], prices: [{ priceType: "франшиза", price: 250 }, { priceType: "retail", price: 700 }, { priceType: "discount", price: 600 }] };
beforeEach(() => { db.product.findMany.mockResolvedValue([product]); });

it("checkout loads the franchise price from the database and ignores submitted prices", async () => {
  const result = await priceOrder({ priceType: "franchise" }, [{ id: 1, quantity: 2, price: 1, franchisePrice: 1 }]);
  expect(result.tier).toBe("franchise");
  expect(result.lines[0]).toMatchObject({ price: 250, total: 500, quantity: 2 });
});

it("keeps a missing price as an unpriced line for 1C instead of borrowing the retail/card price", async () => {
  db.product.findMany.mockResolvedValue([{ ...product, prices: product.prices.filter(p => p.priceType !== "франшиза") }]);
  const result = await priceOrder({ priceType: "franchise" }, [{ id: 1, quantity: 3 }]);
  expect(result.lines[0]).toMatchObject({ price: 0, total: 0, quantity: 3 });
  expect(result.pricing.total).toBe(0);
});

it("continues rejecting unknown prices for ordinary customers", async () => {
  db.product.findMany.mockResolvedValue([{ ...product, prices: [] }]);
  await expect(priceOrder({ priceType: "retail" }, [{ id: 1, quantity: 1 }])).rejects.toThrow("Цена");
});
