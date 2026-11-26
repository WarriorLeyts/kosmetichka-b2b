import { beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ id: 7 as number | null, type: "wholesale", rows: [] as any[] }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn() }, wishlistItem: { findMany: vi.fn() } }));
vi.mock("../_auth", () => ({ currentCustomerId: async () => s.id }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); s.id = 7; s.type = "wholesale"; db.customer.findUnique.mockImplementation(async () => ({ priceType: s.type })); db.wishlistItem.findMany.mockImplementation(async () => s.rows); });
it("uses a private 24-hour window scoped to the customer and does not disclose staff stock", async () => {
  s.rows = [{ quantity: 15, notifiedAt: new Date(), product: { id: 42, name: "Cream", stock: 15, wholesaleStock: 3, images: [] } }, { quantity: 2, notifiedAt: new Date(), product: { id: 43, name: "Unavailable", stock: 10, wholesaleStock: 0, images: [] } }];
  const response = await GET(), body = await response.json();
  expect(body.items).toHaveLength(1); expect(body.items[0]).toMatchObject({ id: 42, quantity: 15 });
  expect(body.items[0]).not.toHaveProperty("stock"); expect(body.items[0]).not.toHaveProperty("wholesaleStock");
  expect(Date.parse(body.items[0].expiresAt) - Date.parse(body.items[0].notifiedAt)).toBe(86400000);
  expect(db.wishlistItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customerId: 7, notified: true, product: { hidden: false }, notifiedAt: { gt: expect.any(Date) } }) }));
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("requires login before reading customer data", async () => { s.id = null; expect((await GET()).status).toBe(401); expect(db.wishlistItem.findMany).not.toHaveBeenCalled(); });
