import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ id: 7 as number | null }));
const db = vi.hoisted(() => ({ product: { findFirst: vi.fn() }, customer: { findUnique: vi.fn() }, wishlistItem: { findUnique: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => state.id ? ({ id: state.id }) : null }));
import { PUT } from "./route";
const req = (b: unknown) => new Request("https://site/api/wishlist", { method: "PUT", body: JSON.stringify(b) });
beforeEach(() => { vi.clearAllMocks(); state.id = 7; db.product.findFirst.mockResolvedValue({ id: 42, stock: 15, wholesaleStock: 0 }); db.customer.findUnique.mockResolvedValue({ priceType: "wholesale" }); db.wishlistItem.findUnique.mockResolvedValue(null); });
it("saves demand idempotently for stock unavailable to this customer, without order writes", async () => {
  expect((await PUT(req({ productId: 42, quantity: 15 }))).status).toBe(200);
  expect(db.wishlistItem.upsert).toHaveBeenCalledWith({ where: { customerId_productId: { customerId: 7, productId: 42 } }, create: { customerId: 7, productId: 42, quantity: 15 }, update: { quantity: 15, notified: false, notifiedAt: null } });
});
it.each([0, true, 1.5, 10001, "15"])("rejects invalid quantity %s", async quantity => { expect((await PUT(req({ productId: 42, quantity }))).status).toBe(400); expect(db.wishlistItem.upsert).not.toHaveBeenCalled(); });
it("does not start a new shortage request for available goods", async () => { db.product.findFirst.mockResolvedValue({ id: 42, stock: 15, wholesaleStock: 3 }); expect((await PUT(req({ productId: 42, quantity: 15 }))).status).toBe(409); });
it("does not let the customer invent a restock timestamp", async () => { expect((await PUT(req({ productId: 42, notified: true }))).status).toBe(400); expect(db.wishlistItem.upsert).not.toHaveBeenCalled(); });
it("requires login", async () => { state.id = null; expect((await PUT(req({ productId: 42, quantity: 15 }))).status).toBe(401); });
