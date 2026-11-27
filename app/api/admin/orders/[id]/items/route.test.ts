import { LEGACY_CAMPAIGN } from "@/lib/campaign";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "t" }) }) }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: 1, role: "manager" })) }));
vi.mock("@/lib/staffScope", () => ({ staffSeesOrder: async () => true }));
vi.mock("@/lib/maxmaOrders", () => ({ isMaxmaOrder: () => false }));
vi.mock("@/lib/orderTier", () => ({ orderTier: () => "retail", repriceOrder: vi.fn(async () => null) }));
vi.mock("@/lib/orderChanges", () => ({ logOrderChanges: vi.fn(async () => []), orderChanges: vi.fn(async () => ({})) }));
vi.mock("@/lib/productRequest", () => ({ productRequestAdded: vi.fn(async () => false), markProductRequestAdded: vi.fn() }));
const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  orderItem: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
  orderItemCheck: { deleteMany: vi.fn(async () => ({})) },
  product: { findMany: vi.fn(async () => [{ id: 999, name: "Новый товар", barcode: null, prices: [{ priceType: "retail", price: 100 }], variants: [] }]) },
  productImage: { findMany: vi.fn(async () => []) },
  user: { findUnique: vi.fn(async () => ({ name: "Менеджер" })) },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { PUT } from "./route";

const items = Array.from({ length: 148 }, (_, n) => ({ id: n + 1, productId: n + 1, productName: `Товар ${n + 1}`, quantity: 2, price: 100, total: 200, variantName: null }));
const call = (body: object) => PUT(new NextRequest("https://x/api/admin/orders/7/items", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "7" }) });
beforeEach(() => { vi.clearAllMocks(); db.order.findUnique.mockResolvedValue({ id: 7, customerId: 1, status: "assembly", customer: { priceType: "retail" }, items }); });

describe("only edited lines lose their assembly mark", () => {
  it("adding a product while saving all 148 unchanged lines keeps every existing mark", async () => {
    expect((await call({ items, newItems: [{ productId: 999, productName: "Новый товар", quantity: 1 }] })).status).toBe(200);
    expect(db.orderItemCheck.deleteMany).not.toHaveBeenCalled();
    expect(db.orderItem.create).toHaveBeenCalledTimes(1);
  });
  it("a changed quantity clears only that line", async () => {
    expect((await call({ items: items.map((i) => i.id === 42 ? { ...i, quantity: 3 } : i) })).status).toBe(200);
    expect(db.orderItemCheck.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.orderItemCheck.deleteMany).toHaveBeenCalledWith({ where: { orderItemId: { in: [42] } } });
  });
  it("a changed variant clears only that line even with the same quantity", async () => {
    expect((await call({ items: items.map((i) => i.id === 42 ? { ...i, variantName: "Другой оттенок" } : i) })).status).toBe(200);
    expect(db.orderItemCheck.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.orderItemCheck.deleteMany).toHaveBeenCalledWith({ where: { orderItemId: { in: [42] } } });
  });
});

vi.mock("@/lib/campaignSettings", () => ({ getCampaign: async () => LEGACY_CAMPAIGN }));
