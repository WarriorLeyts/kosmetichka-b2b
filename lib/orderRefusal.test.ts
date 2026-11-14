/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ order: null as any, tasks: [] as any[], logs: [] as any[], failQueue: false }));
const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(async () => state.order ? { ...state.order } : null), update: vi.fn(async ({ data }: any) => Object.assign(state.order, data)) },
  customer: { findUnique: vi.fn(async () => ({ loyaltyCard: "2000123", phone: "89991234567" })) },
  orderStatusLog: { create: vi.fn(async (a: any) => { state.logs.push(a); return a; }) },
  maxmaTask: {
    findFirst: vi.fn(async ({ where }: any) => [...state.tasks].reverse().find(t => t.orderId === where.orderId && t.action === where.action) ?? null),
    create: vi.fn(async ({ data }: any) => { if (state.failQueue) throw new Error("outbox unavailable"); const t = { id: state.tasks.length + 1, status: "pending", ...data }; state.tasks.push(t); return t; }),
    updateMany: vi.fn(async ({ where, data }: any) => { const t = state.tasks.find(t => t.id === where.id && t.status === where.status); if (t) Object.assign(t, data); return { count: t ? 1 : 0 }; }),
  },
  $transaction: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: db }));
const queue = vi.hoisted(() => ({ runOrderMaxmaTasks: vi.fn() }));
vi.mock("./maxmaQueue", () => queue);
import { refuseOrder } from "./orderRefusal";
beforeEach(() => {
  vi.clearAllMocks(); state.order = { id: 252, customerId: 1, status: "exported", bonusesApplied: 630, bonusesCollected: 105 }; state.tasks = []; state.logs = []; state.failQueue = false;
  db.$transaction.mockImplementation(async (fn: any) => {
    const before = structuredClone({ order: state.order, tasks: state.tasks, logs: state.logs });
    try { return await fn(db); } catch (e) { Object.assign(state, before); throw e; }
  });
  queue.runOrderMaxmaTasks.mockResolvedValue({ ran: 0 });
});
describe("staff records a customer's refusal", () => {
  it.each(["payment", "exported"])("cancels %s and persists the reversal atomically with the status", async status => {
    state.order.status = status;
    const r = await refuseOrder(252, 7);
    expect(r.order.status).toBe("cancelled");
    expect(r.bonusCancellation).toMatchObject({ status: "pending", returned: 630, withdrawn: 105 });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ orderId: 252, action: "cancel", payload: { client: { card: "2000123" } } });
    expect(state.logs[0].data).toMatchObject({ fromStatus: status, toStatus: "cancelled", userId: 7 });
  });
  it("repeated or concurrent clicks create only one reversal and status entry", async () => {
    await Promise.all([refuseOrder(252, 7), refuseOrder(252, 7)]);
    expect(state.tasks).toHaveLength(1); expect(state.logs).toHaveLength(1);
  });
  it("rolls the status back if the reversal could not be saved", async () => {
    state.failQueue = true;
    await expect(refuseOrder(252, 7)).rejects.toThrow("outbox unavailable");
    expect(state.order.status).toBe("exported"); expect(state.tasks).toHaveLength(0);
    expect(queue.runOrderMaxmaTasks).not.toHaveBeenCalled();
  });
  it("reports success only after MAXMA acknowledged the queued reversal", async () => {
    queue.runOrderMaxmaTasks.mockImplementation(async () => { state.tasks[0].status = "done"; });
    expect((await refuseOrder(252, 7)).bonusCancellation?.status).toBe("done");
  });
  it("allows retry of a failed reversal without creating a second operation", async () => {
    await refuseOrder(252, 7); state.tasks[0].status = "failed";
    await refuseOrder(252, 7);
    expect(state.tasks).toHaveLength(1); expect(state.tasks[0].status).toBe("pending");
  });
  it("cancels an order without loyalty effects without creating a financial operation", async () => {
    state.order.bonusesApplied = 0; state.order.bonusesCollected = 0;
    const r = await refuseOrder(252, 7);
    expect(r.bonusCancellation).toBeNull(); expect(state.tasks).toHaveLength(0);
  });
});
