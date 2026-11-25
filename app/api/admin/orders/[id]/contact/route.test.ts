import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ authenticated: true, scoped: true }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => access.authenticated ? { id: 1, role: "manager" } : null }));
vi.mock("@/lib/staffScope", () => ({ staffSeesOrder: async () => access.scoped }));
const db = vi.hoisted(() => ({ order: { findUnique: vi.fn(), update: vi.fn() }, orderStatusLog: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const exportJob = vi.hoisted(() => ({ kickOrderTo1C: vi.fn() }));
vi.mock("@/lib/onecOrders", () => exportJob);
import { POST } from "./route";
const call = (action: string, extra = {}) => POST(new Request("https://x/api/admin/orders/7/contact", { method: "POST", body: JSON.stringify({ action, ...extra }) }), { params: Promise.resolve({ id: "7" }) });

beforeEach(() => {
  vi.resetAllMocks(); access.authenticated = true; access.scoped = true;
  db.order.findUnique.mockResolvedValue({ id: 7, status: "consultation", customerConfirmed: false, confirmRequestedAt: new Date() });
  db.order.update.mockResolvedValue({ id: 7 });
});

describe("manual no-contact pause", () => {
  it.each(["pending", "approved", "assembly", "consultation", "payment"])("pauses %s and atomically records the previous stage without changing order data", async (status) => {
    db.order.findUnique.mockResolvedValue({ id: 7, status });
    expect((await call("hold")).status).toBe(200);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 7, status, oneCSendingAt: null, oneCExportedAt: null, oneCRef: null, oneCStockRef: null },
      data: { status: "no_contact", statusLogs: { create: { fromStatus: status, toStatus: "no_contact", userId: 1 } } },
    });
    expect(exportJob.kickOrderTo1C).not.toHaveBeenCalled();
  });
  it.each(["exported", "cancelled"])("cannot pause %s orders", async status => {
    db.order.findUnique.mockResolvedValue({ id: 7, status });
    expect((await call("hold")).status).toBe(409); expect(db.order.update).not.toHaveBeenCalled();
  });
  it.each(["oneCSendingAt", "oneCExportedAt", "oneCRef", "oneCStockRef"])("blocks an export in progress or already created (%s)", async field => {
    db.order.findUnique.mockResolvedValue({ id: 7, status: "payment", [field]: "set" });
    expect((await call("hold")).status).toBe(409); expect(db.order.update).not.toHaveBeenCalled();
  });
  it("repeated hold is idempotent and never replaces the saved stage", async () => {
    db.order.findUnique.mockResolvedValue({ id: 7, status: "no_contact" });
    expect((await call("hold")).status).toBe(200); expect(db.order.update).not.toHaveBeenCalled();
  });
  it("a concurrently claimed export wins without leaving a false history entry", async () => {
    db.order.update.mockRejectedValue({ code: "P2025" });
    expect((await call("hold")).status).toBe(409);
  });
});

describe("returning a paused order", () => {
  it.each(["pending", "approved", "assembly", "consultation", "payment"])("restores the recorded %s stage; ignores a supplied target and preserves confirmation and checks", async status => {
    db.order.findUnique.mockResolvedValue({ id: 7, status: "no_contact" });
    db.orderStatusLog.findFirst.mockResolvedValue({ id: 15, fromStatus: status, toStatus: "no_contact" });
    expect((await call("resume", { status: "exported", target: "payment" })).status).toBe(200);
    expect(db.orderStatusLog.findFirst).toHaveBeenCalledWith({ where: { orderId: 7, toStatus: "no_contact" }, orderBy: { id: "desc" } });
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 7, status: "no_contact" }, data: { status, statusLogs: { create: { fromStatus: "no_contact", toStatus: status, userId: 1 } } } });
    expect(exportJob.kickOrderTo1C).toHaveBeenCalledTimes(["payment", "approved"].includes(status) ? 1 : 0);
  });
  it.each([null, { id: 4, fromStatus: "exported", toStatus: "no_contact" }])("missing or invalid history never guesses a stage", async log => {
    db.order.findUnique.mockResolvedValue({ id: 7, status: "no_contact" }); db.orderStatusLog.findFirst.mockResolvedValue(log);
    expect((await call("resume")).status).toBe(409); expect(db.order.update).not.toHaveBeenCalled();
  });
  it.each(["cancelled", "exported", "assembly"])("cannot restore an order that has meanwhile become %s", async status => {
    db.order.findUnique.mockResolvedValue({ id: 7, status });
    expect((await call("resume")).status).toBe(409); expect(db.order.update).not.toHaveBeenCalled();
  });
  it("keeps staff authentication and manager scope", async () => {
    access.authenticated = false; expect((await call("hold")).status).toBe(401);
    access.authenticated = true; access.scoped = false; expect((await call("hold")).status).toBe(404);
    expect(db.order.findUnique).not.toHaveBeenCalled(); expect(db.order.update).not.toHaveBeenCalled();
  });
});
