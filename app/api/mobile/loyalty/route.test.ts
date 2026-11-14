import { beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: io } }));
vi.mock("../_auth", () => ({ currentCustomerId: async () => 7 }));
import { DELETE } from "./route";
beforeEach(() => { vi.clearAllMocks(); io.findUnique.mockResolvedValue({ loyaltyCard: "123456" }); io.updateMany.mockResolvedValue({ count: 1 }); });
describe("explicit card unlink", () => {
 it("clears both card kinds and remembers the card so phone sync cannot undo the unlink", async () => {
   expect((await DELETE()).status).toBe(200);
   expect(io.updateMany).toHaveBeenCalledWith({ where: { id: 7, loyaltyCard: "123456" }, data: { loyaltyCard: null, maxmaDiscount: false, maxmaRetail: false, loyaltyUnlinkedCards: { push: "123456" } } });
 });
 it("does not report success when the card changed concurrently", async () => { io.updateMany.mockResolvedValue({ count: 0 }); expect((await DELETE()).status).toBe(409); });
});
