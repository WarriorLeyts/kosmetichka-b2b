import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ status: "cancelled" }));
const io = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), onOrderStatus: vi.fn(), notifyOrderStatus: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { order: { findMany: io.findMany, updateMany: io.updateMany } } }));
vi.mock("./maxmaOrders", () => ({ MAXMA_ORDER_WHERE: {}, onOrderStatus: io.onOrderStatus }));
vi.mock("./notify", () => ({ notifyOrderStatus: io.notifyOrderStatus }));
import { markExported } from "./onecOrders";
beforeEach(() => {
  vi.clearAllMocks(); state.status = "cancelled";
  io.findMany.mockImplementation(async ({ where }) => where.status.not === state.status ? [] : [{ id: 252 }]);
  io.updateMany.mockImplementation(async ({ where, data }) => { if (state.status === where.status.not) return { count: 0 }; state.status = data.status; return { count: 1 }; });
});
describe("an exporter finishing after the customer's refusal", () => {
  it("never restores a cancelled order or confirms its loyalty purchase", async () => {
    await markExported([252]);
    expect(state.status).toBe("cancelled");
    expect(io.onOrderStatus).not.toHaveBeenCalled(); expect(io.notifyOrderStatus).not.toHaveBeenCalled();
  });
  it("still confirms an active exported order", async () => {
    state.status = "payment"; await markExported([252]);
    expect(state.status).toBe("exported"); expect(io.onOrderStatus).toHaveBeenCalled();
  });
});
