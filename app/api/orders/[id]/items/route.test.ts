/**
 * Customer changes their order: until payment only, added products at the customer's prices,
 * an added product already in the order adds pieces to that line, every change is logged for
 * staff and summarised in the order chat.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "t" }) }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: vi.fn(async () => ({ id: 1 })) }));
vi.mock("@/lib/maxmaOrders", () => ({ isMaxmaOrder: () => false, recalcOrderLoyalty: vi.fn(), loyaltyResponse: vi.fn() }));
vi.mock("@/lib/orderPricing", async (orig) => ({
  ...(await orig<typeof import("@/lib/orderPricing")>()),
  priceOrderItems: vi.fn(async (_c: unknown, items: { id: number; quantity: number; variantName?: string | null }[]) =>
    items.map((i) => ({ productId: i.id, productName: `Товар ${i.id}`, barcode: null, quantity: i.quantity, price: 100, total: 100 * i.quantity, variantName: i.variantName ?? null, variantImageUrl: null, sku: String(i.id) }))
  ),
}));
const log = vi.hoisted(() => ({ logOrderChanges: vi.fn(async () => [{ kind: "added", productName: "Товар 9", newQuantity: 2 }]), summarizeRows: vi.fn(() => "+ Товар 9 — 2 шт.") }));
vi.mock("@/lib/orderChanges", () => log);

const db = vi.hoisted(() => {
  const tx = {
    orderItemCheck: { deleteMany: vi.fn() },
    orderItemPhoto: { deleteMany: vi.fn() },
    orderItem: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn(async () => []) },
    order: { update: vi.fn() },
  };
  return {
    tx,
    order: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn(async () => ({ id: 1, priceType: "wholesale" })) },
    orderItem: { findMany: vi.fn(async () => []) },
    orderMessage: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { PUT } from "./route";

const order = (status: string) => ({
  id: 7,
  customerId: 1,
  status,
  items: [
    { id: 1, productId: 10, productName: "Тонер", quantity: 2, price: 3000, total: 6000, variantName: null },
    { id: 2, productId: 20, productName: "Маска", quantity: 1, price: 500, total: 500, variantName: null },
  ],
});
const put = (body: object) => PUT(new Request("https://x/api/orders/7/items", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "7" }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(order("assembly"));
});

describe("customer edits an order", () => {
  it("refused once the order waits for payment", async () => {
    db.order.findUnique.mockResolvedValue(order("payment"));
    const r = await put({ items: [{ id: 1, quantity: 3 }] });
    expect(r.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("someone else's order → 403", async () => {
    db.order.findUnique.mockResolvedValue({ ...order("pending"), customerId: 2 });
    expect((await put({ removeIds: [2] })).status).toBe(403);
  });

  it("changes quantity, removes, adds — logs it and tells the manager in the chat", async () => {
    const r = await put({ items: [{ id: 1, quantity: 3 }], removeIds: [2], newItems: [{ id: 9, quantity: 2 }] });
    expect(r.status).toBe(200);
    expect(db.tx.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { quantity: 3, total: 9000 } });
    expect(db.tx.orderItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] }, orderId: 7 } });
    expect(db.tx.orderItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 9, quantity: 2, price: 100, total: 200 }) });
    expect(log.logOrderChanges).toHaveBeenCalledWith(7, "customer", null, expect.any(Array), expect.any(Array));
    expect(db.orderMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 7, source: "customer", text: expect.stringContaining("Клиент изменил заказ") }) });
  });

  it("a product already in the order adds pieces to that line, no second line", async () => {
    await put({ newItems: [{ id: 10, quantity: 2 }] });
    expect(db.tx.orderItem.create).not.toHaveBeenCalled();
    expect(db.tx.orderItem.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { quantity: 4, total: 12000 } });
  });

  it("can't remove every line", async () => {
    expect((await put({ removeIds: [1, 2] })).status).toBe(400);
  });

  it("wholesale minimum: can't go under 5 000 by removing", async () => {
    const r = await put({ items: [{ id: 1, quantity: 1 }] }); // 3 000 + 500
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("min_order");
  });
});
