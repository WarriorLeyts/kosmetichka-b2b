import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ role: "guest", hiddenBrand: false, photo: false, owns: false, db: { product: { findUnique: vi.fn() }, order: { findFirst: vi.fn() }, customer: { findUnique: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "auth_token" && m.role === "customer" ? { value: "customer" } : name === "admin_token" && ["admin", "manager"].includes(m.role) ? { value: m.role } : undefined }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 3 }) }));
vi.mock("@/lib/auth", () => ({ verifyToken: async () => ({ role: m.role, id: 7 }) }));
vi.mock("@/lib/brandVisibility", () => ({ brandProductExcluded: async () => m.hiddenBrand }));
vi.mock("@/lib/arrivals", () => ({ arrivalLabels: async () => new Map(), withArrivalLabel: (p: unknown) => p }));
vi.mock("@/lib/campaignSettings", async () => ({ getCampaign: async () => (await import("@/lib/campaign")).LEGACY_CAMPAIGN }));
import { GET } from "./route";
const get = () => GET(new Request("https://example.com/api/products/42"), { params: Promise.resolve({ id: "42" }) });
beforeEach(() => {
  vi.clearAllMocks(); m.role = "guest"; m.hiddenBrand = false; m.photo = false; m.owns = false;
  m.db.product.findUnique.mockImplementation(async () => ({ id: 42, name: "Крем", brandGuid: null, brand: null, hidden: false, images: m.photo ? [{ path: "1c/p.jpg" }] : [], prices: [{ priceType: "retail", price: 500 }], stock: 100 }));
  m.db.order.findFirst.mockImplementation(async () => m.owns ? { id: 99 } : null);
  m.db.customer.findUnique.mockResolvedValue({ priceType: "retail" });
});
it("does not expose a private product through a guest's direct URL", async () => {
  expect((await get()).status).toBe(404); expect(m.db.order.findFirst).not.toHaveBeenCalled();
});
it("checks the current customer's order ownership rather than trusting an order ID from the client", async () => {
  m.role = "customer";
  expect((await get()).status).toBe(404);
  expect(m.db.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 3, items: { some: { productId: 42 } } } }));
  m.owns = true;
  const r = await get(); expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ id: 42, name: "Крем", images: [], orderOnly: true, orderId: 99 });
});
it.each(["admin", "manager"])("lets %s inspect photo-less products without an existing customer order", async role => {
  m.role = role; expect((await get()).status).toBe(200); expect(m.db.order.findFirst).not.toHaveBeenCalled();
});
it("publishes the product normally as soon as it has a photo", async () => {
  m.photo = true; const r = await get(); expect(r.status).toBe(200); expect(await r.json()).not.toHaveProperty("orderOnly");
});
it("does not bypass an explicit hidden-brand rule merely because the customer has an order", async () => {
  m.role = "customer"; m.owns = true; m.hiddenBrand = true; expect((await get()).status).toBe(404);
});
