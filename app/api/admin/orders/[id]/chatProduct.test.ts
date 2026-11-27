import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ linked: vi.fn(), reprice: vi.fn(async () => null), order: { findUnique: vi.fn(), update: vi.fn(async () => ({})) }, orderItem: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) }, orderMessage: { update: vi.fn(async () => ({})) }, transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: 1, role: "manager" })) }));
vi.mock("@/lib/staffScope", () => ({ staffSeesOrder: async () => true }));
vi.mock("@/lib/maxmaOrders", () => ({ isMaxmaOrder: () => false }));
vi.mock("@/lib/orderTier", () => ({ orderTier: () => "retail", repriceOrder: m.reprice }));
vi.mock("@/lib/orderChanges", () => ({ logOrderChanges: async () => [], orderChanges: async () => ({}) }));
vi.mock("@/lib/productRequest", () => ({ chatProductCard: m.linked }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: m.order, orderItem: m.orderItem, orderMessage: m.orderMessage, orderItemCheck: { deleteMany: vi.fn() }, user: { findUnique: async () => ({ name: "Менеджер" }) }, productImage: { findMany: async () => [] }, $transaction: m.transaction } }));
import { PUT } from "./items/route";
import { requireAdmin } from "@/lib/auth";
const line = { id: 10, productId: 7, productName: "Крем", quantity: 2, price: 1500, total: 3000, variantName: null };
const card = { _t: "product-question", id: 7, name: "Крем", question: "Как использовать?", price: 1500, variantName: null, imagePath: "cream.jpg", added: false };
const call = (body: unknown) => PUT(new NextRequest("https://test/api/admin/orders/9/items", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "9" }) });
beforeEach(() => { vi.clearAllMocks(); m.order.findUnique.mockResolvedValue({ id: 9, customerId: 3, status: "assembly", items: [line], customer: { priceType: "retail" } }); m.linked.mockResolvedValue({ id: 21, card, originalText: JSON.stringify(card) }); m.transaction.mockImplementation(async ops => Promise.all(ops)); });
describe("adding a customer's product card", () => {
  it("rejects a revoked staff session before reading or editing the order", async () => { vi.mocked(requireAdmin).mockResolvedValueOnce(null); expect((await call({ chatProduct: { messageId: 21, quantity: 1 } })).status).toBe(401); expect(m.order.findUnique).not.toHaveBeenCalled(); expect(m.orderItem.update).not.toHaveBeenCalled(); });
  it("uses stored product and server price; quantity is added to an existing line", async () => {
    expect((await call({ chatProduct: { messageId: 21, quantity: 3 }, items: [{ id: 10, quantity: 999, price: 1 }], newItems: [{ productId: 999 }], removeIds: [10] })).status).toBe(200);
    expect(m.orderItem.update).toHaveBeenCalledWith({ where: { id: 10 }, data: expect.objectContaining({ quantity: 5, price: 1500, total: 7500 }) }); expect(m.orderItem.create).not.toHaveBeenCalled();
    expect(m.orderMessage.update).toHaveBeenCalledWith({ where: { id: 21, text: JSON.stringify(card) }, data: { text: JSON.stringify({ ...card, added: true, addedQuantity: 3 }) } });
    expect(m.transaction).toHaveBeenCalledTimes(1); expect(m.reprice).toHaveBeenCalledWith(9);
  });
  it.each([0, -1, 1.5, 10001, true, null])("rejects invalid quantity %s without changing lines", async quantity => { expect((await call({ chatProduct: { messageId: 21, quantity } })).status).toBe(400); expect(m.orderItem.update).not.toHaveBeenCalled(); });
  it("rejects already added and foreign cards", async () => {
    m.linked.mockResolvedValueOnce({ id: 21, card: { ...card, added: true } }); expect((await call({ chatProduct: { messageId: 21, quantity: 1 } })).status).toBe(409);
    m.linked.mockResolvedValueOnce(null); expect((await call({ chatProduct: { messageId: 55, quantity: 1 } })).status).toBe(400); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("keeps stage restrictions and reports an atomic stale-marker failure", async () => {
    m.order.findUnique.mockResolvedValueOnce({ id: 9, status: "exported", items: [line] }); expect((await call({ chatProduct: { messageId: 21, quantity: 1 } })).status).toBe(400);
    m.transaction.mockRejectedValueOnce({ code: "P2025" }); expect((await call({ chatProduct: { messageId: 21, quantity: 1 } })).status).toBe(409); expect(m.reprice).not.toHaveBeenCalled();
  });
});
