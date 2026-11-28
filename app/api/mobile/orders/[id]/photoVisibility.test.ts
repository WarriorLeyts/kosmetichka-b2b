import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: { order: { findUnique: vi.fn() }, productImage: { findMany: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("../../_auth", () => ({ currentCustomerId: async () => 3 }));
vi.mock("@/lib/orderChanges", () => ({ orderChanges: async () => ({ lines: { 1: { staff: { kind: "added", quantity: 2 } } }, removed: [] }) }));
vi.mock("@/lib/orderService", () => ({ orderService: () => ({ phase: "assembling" }) }));
import { GET } from "./route";
const get = () => GET(new Request("https://example.com/api/mobile/orders/9"), { params: Promise.resolve({ id: "9" }) });
beforeEach(() => { vi.clearAllMocks(); m.db.order.findUnique.mockResolvedValue({ id: 9, customerId: 3, status: "assembly", total: 1000, priceType: "retail", createdAt: new Date(), items: [{ id: 1, productId: 42, productName: "Товар без фото", quantity: 2, price: 500, total: 1000 }] }); m.db.productImage.findMany.mockResolvedValue([]); });
it("keeps a manager-added photo-less line fully visible in its owner's order", async () => {
  const r = await get(); expect(r.status).toBe(200);
  expect((await r.json()).items).toEqual([expect.objectContaining({ productId: 42, productName: "Товар без фото", quantity: 2, price: 500, total: 1000, imagePath: null, staffChange: { kind: "added", quantity: 2 } })]);
});
it("does not disclose another customer's order", async () => {
  m.db.order.findUnique.mockResolvedValue({ id: 9, customerId: 4 }); expect((await get()).status).toBe(404); expect(m.db.productImage.findMany).not.toHaveBeenCalled();
});
