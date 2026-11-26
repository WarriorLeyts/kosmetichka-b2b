import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ order: { id: 42, customerId: 9, status: "pending", serviceStartedAt: null as Date | null, serviceManagerId: null as number | null }, missing: false }));
const tx = vi.hoisted(() => ({ order: { findUnique: vi.fn(), updateMany: vi.fn() }, orderMessage: { create: vi.fn() }, adminAuditLog: { create: vi.fn() } }));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
const notify = vi.hoisted(() => vi.fn());
const live = vi.hoisted(() => vi.fn());
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("./notify", () => ({ notifyLater: notify }));
vi.mock("./realtime", () => ({ orderChanged: live }));
import { startOrderService } from "./orderServiceStart";
const actor = { id: 5, name: "Тестовый менеджер", login: "test-staff" };
beforeEach(() => {
  vi.clearAllMocks(); state.order = { id: 42, customerId: 9, status: "pending", serviceStartedAt: null, serviceManagerId: null }; state.missing = false;
  tx.order.findUnique.mockImplementation(async () => state.missing ? null : { ...state.order });
  tx.order.updateMany.mockImplementation(async ({ data }) => { if (state.order.serviceStartedAt) return { count: 0 }; Object.assign(state.order, data); return { count: 1 }; });
  tx.orderMessage.create.mockResolvedValue({ id: 1 }); tx.adminAuditLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async callback => callback(tx));
});
it("commits the acknowledgement, one automatic message and an audit together, without changing the business stage", async () => {
  expect((await startOrderService(42, actor)).kind).toBe("started");
  expect(state.order.status).toBe("pending"); expect(state.order.serviceManagerId).toBe(5);
  expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42, status: { in: ["pending", "approved"] }, serviceStartedAt: null } }));
  expect(tx.orderMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 42, source: "customer", automatic: true, isFromPicker: true }) });
  expect(tx.adminAuditLog.create).toHaveBeenCalled(); expect(notify).toHaveBeenCalledTimes(1);
});
it("a repeated tap by the same manager does not duplicate anything", async () => {
  await startOrderService(42, actor); expect((await startOrderService(42, actor)).kind).toBe("already");
  expect(tx.orderMessage.create).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
});
it("a different manager cannot replace the acknowledged manager", async () => {
  await startOrderService(42, actor); expect((await startOrderService(42, { ...actor, id: 6 })).kind).toBe("owned");
  expect(state.order.serviceManagerId).toBe(5); expect(tx.orderMessage.create).toHaveBeenCalledTimes(1);
});
it("a concurrent claim has one winner and one notification", async () => {
  const result = await Promise.all([startOrderService(42, actor), startOrderService(42, { ...actor, id: 6 })]);
  expect(result.filter(r => r.kind === "started")).toHaveLength(1);
  expect(tx.orderMessage.create).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
});
it.each(["assembly", "consultation", "payment", "no_contact", "cancelled", "exported"])("does not revive or claim a %s order", async status => {
  state.order.status = status; expect((await startOrderService(42, actor)).kind).toBe("stage");
  expect(tx.order.updateMany).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
});
it("a human reply records acknowledgement without adding another automatic message or push", async () => {
  expect((await startOrderService(42, actor, false)).kind).toBe("started");
  expect(tx.orderMessage.create).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  expect(live).toHaveBeenCalledWith(42, 9);
});
it("refreshes customer screens after the transaction has committed", async () => {
  db.$transaction.mockImplementationOnce(async callback => { const result = await callback(tx); expect(live).not.toHaveBeenCalled(); return result; });
  await startOrderService(42, actor);
  expect(live).toHaveBeenCalledTimes(1); expect(live).toHaveBeenCalledWith(42, 9);
});
it("missing orders and failed transactions produce no notification", async () => {
  state.missing = true; expect((await startOrderService(42, actor)).kind).toBe("missing");
  state.missing = false; tx.adminAuditLog.create.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(startOrderService(42, actor)).rejects.toThrow("database unavailable"); expect(notify).not.toHaveBeenCalled(); expect(live).not.toHaveBeenCalled();
});
