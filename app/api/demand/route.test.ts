import { beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ customerId: 7 as number | null }));
const db = vi.hoisted(() => ({ productWish: { findMany: vi.fn(async () => []), findUnique: vi.fn(), count: vi.fn(async () => 0), upsert: vi.fn(async () => ({ id: 42 })), deleteMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../mobile/_auth", () => ({ currentCustomerId: async () => s.customerId }));
vi.mock("fs/promises", () => ({ access: vi.fn(async () => {}) }));
import { GET, POST, DELETE } from "./route";
const post = (b: unknown) => POST(new Request("https://site/api/demand", { method: "POST", body: JSON.stringify(b) }));
beforeEach(() => { vi.clearAllMocks(); s.customerId = 7; db.productWish.findUnique.mockResolvedValue(null); });
it("ignores a supplied customerId and deduplicates the signed-in customer's wish", async () => {
  expect((await post({ customerId: 99, name: " Cream  SPF ", quantity: 15 })).status).toBe(200);
  expect(db.productWish.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId_nameKey: { customerId: 7, nameKey: "cream spf" } }, create: expect.objectContaining({ customerId: 7, quantity: 15 }) }));
});
it("never accepts another customer's photo or file traversal", async () => {
  for (const photoName of ["99_12345678-1234-1234-1234-123456789012.webp", "../image.webp"]) expect((await post({ name: "Cream", quantity: 2, photoName })).status).toBe(400);
  expect(db.productWish.upsert).not.toHaveBeenCalled();
});
it("lists and removes only the current customer's wishes", async () => {
  await GET(); await DELETE(new Request("https://site/api/demand?id=42"));
  expect(db.productWish.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 7 } }));
  expect(db.productWish.deleteMany).toHaveBeenCalledWith({ where: { id: 42, customerId: 7 } });
});
it("requires customer authentication", async () => { s.customerId = null; expect((await post({ name: "Cream", quantity: 1 })).status).toBe(401); expect(db.productWish.upsert).not.toHaveBeenCalled(); });
it("does not duplicate an already-linked request in the missing-products list", async () => { db.productWish.findUnique.mockResolvedValue({ linkedProductId: 42 }); expect((await post({ name: "Cream", quantity: 1 })).status).toBe(409); });
