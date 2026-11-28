import { beforeEach, expect, it, vi } from "vitest";
import { LEGACY_CAMPAIGN } from "@/lib/campaign";
const m = vi.hoisted(() => ({ role: "guest", db: { product: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() }, customer: { findUnique: vi.fn() }, productPrice: { findMany: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => k === "auth_token" && m.role === "customer" ? { value: "customer" } : k === "admin_token" && ["admin", "manager"].includes(m.role) ? { value: m.role } : undefined }) }));
vi.mock("@/lib/auth", () => ({ verifyToken: async () => ({ id: 7, role: m.role }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 3 }) }));
vi.mock("@/lib/campaignSettings", () => ({ getCampaign: async () => LEGACY_CAMPAIGN }));
vi.mock("@/lib/brandVisibility", () => ({ visibleBrandsWhere: async () => ({}) }));
vi.mock("@/lib/arrivals", () => ({ arrivalLabels: async () => new Map(), withArrivalLabel: (p: unknown) => p, listArrivals: async () => [{ productId: 42, isNew: true, arrivedAt: new Date(), places: ["shop"] }] }));
vi.mock("@/lib/related", () => ({ relatedIds: async () => [42] }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); m.role = "guest"; m.db.product.findMany.mockResolvedValue([]); m.db.product.count.mockResolvedValue(0); m.db.customer.findUnique.mockResolvedValue({ priceType: "wholesale" }); m.db.productPrice.findMany.mockResolvedValue([]); });
it.each(["", "?search=крем", "?ids=42", "?related=1", "?arrivals=1"])("enforces photos for guest/customer catalogue branch %s", async query => {
  for (const role of ["guest", "customer"]) {
    m.role = role; m.db.product.findMany.mockClear();
    expect((await GET(new Request("https://example.com/api/catalog/products" + query))).status).toBe(200);
    expect(m.db.product.findMany).toHaveBeenCalled();
    for (const [args] of m.db.product.findMany.mock.calls) expect(JSON.stringify(args.where)).toContain('"images":{"some":{"path":{"not":""}}}');
  }
});
it.each(["admin", "manager"])("does not filter photo-less inventory for verified %s", async role => {
  m.role = role; expect((await GET(new Request("https://example.com/api/catalog/products?ids=42"))).status).toBe(200);
  expect(m.db.product.findMany.mock.calls[0][0].where).not.toHaveProperty("images");
});
it("does not grant staff visibility through forged URL flags", async () => {
  m.role = "customer"; await GET(new Request("https://example.com/api/catalog/products?ids=42&staff=true&includeNoPhoto=true"));
  expect(m.db.product.findMany.mock.calls[0][0].where.images).toBeTruthy();
});
