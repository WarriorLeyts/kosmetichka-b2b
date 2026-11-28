import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ id: 9, findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("../_auth", () => ({ currentCustomerId: async () => m.id }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: m } }));
import { DELETE } from "./route";
beforeEach(() => { vi.clearAllMocks(); m.id = 9; m.findUnique.mockResolvedValue({ loyaltyCard: "990123", loyaltyAutoLinkDisabled: false }); m.updateMany.mockResolvedValue({ count: 1 }); });
describe("explicit unlink", () => {
  it("remembers the exact card without changing MAXMA", async () => { expect((await DELETE()).status).toBe(200); expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 9, loyaltyCard: "990123" }, data: { loyaltyCard: null, maxmaDiscount: false, maxmaRetail: false, loyaltyAutoLinkDisabled: false, loyaltyUnlinkedCards: { push: "990123" } } }); });
  it("preserves legacy blocking without a known card", async () => { m.findUnique.mockResolvedValue({ loyaltyCard: null, loyaltyAutoLinkDisabled: true }); await DELETE(); expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ loyaltyAutoLinkDisabled: true }) })); });
  it("does not unlink a concurrently replaced card", async () => { m.updateMany.mockResolvedValue({ count: 0 }); expect((await DELETE()).status).toBe(409); });
  it("requires authentication", async () => { m.id = 0; expect((await DELETE()).status).toBe(401); expect(m.updateMany).not.toHaveBeenCalled(); });
});
