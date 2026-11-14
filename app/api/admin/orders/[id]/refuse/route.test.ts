import { beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ requireAdmin: vi.fn(), staffSeesOrder: vi.fn(), refuseOrder: vi.fn(), notifyOrderStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: io.requireAdmin }));
vi.mock("@/lib/staffScope", () => ({ staffSeesOrder: io.staffSeesOrder }));
vi.mock("@/lib/orderRefusal", () => ({ refuseOrder: io.refuseOrder, RefusalError: class extends Error {} }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: io.notifyOrderStatus }));
import { POST } from "./route";
const call = (id = "252") => POST(new Request(`https://x/api/admin/orders/${id}/refuse`, { method: "POST" }), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); io.requireAdmin.mockResolvedValue({ id: 7, role: "manager" }); io.staffSeesOrder.mockResolvedValue(true); io.refuseOrder.mockResolvedValue({ changed: true, order: { status: "cancelled" } }); });
describe("staff refusal endpoint", () => {
  it("requires staff authentication", async () => { io.requireAdmin.mockResolvedValue(null); expect((await call()).status).toBe(401); expect(io.refuseOrder).not.toHaveBeenCalled(); });
  it("does not change orders outside the manager's scope", async () => { io.staffSeesOrder.mockResolvedValue(false); expect((await call()).status).toBe(404); expect(io.refuseOrder).not.toHaveBeenCalled(); });
  it("validates the order id", async () => { expect((await call("NaN")).status).toBe(400); expect(io.refuseOrder).not.toHaveBeenCalled(); });
  it("records the refusal and notifies once, with no duplicate notification on retry", async () => {
    expect((await call()).status).toBe(200);
    expect(io.refuseOrder).toHaveBeenCalledWith(252, 7);
    io.refuseOrder.mockResolvedValue({ changed: false, order: { status: "cancelled" } });
    await call(); expect(io.notifyOrderStatus).toHaveBeenCalledTimes(1);
  });
});
