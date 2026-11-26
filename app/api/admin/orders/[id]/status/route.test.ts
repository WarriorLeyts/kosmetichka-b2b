/** «Заказ оформлен» (payment) only after the customer confirmed the order sent «На проверке». */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: 1, role: "manager" })) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/maxmaOrders", () => ({ onOrderStatus: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ orderChanged: vi.fn() }));
vi.mock("@/lib/applyPickChecks", () => ({ applyPickChecks: vi.fn(async () => ({ changed: [], emptied: false })) }));
const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  user: { findUnique: vi.fn(async () => ({ name: "Ольга" })) },
  orderItem: { findMany: vi.fn(async () => []) },
  orderItemCheck: { deleteMany: vi.fn() },
  orderStatusLog: { create: vi.fn(async () => ({})) },
  orderMessage: { create: vi.fn(async () => ({ id: 99 })) },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("@/lib/staffScope", async (orig) => ({ ...(await orig<typeof import("@/lib/staffScope")>()), staffSeesOrder: async () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";
import { notifyOrderStatus } from "@/lib/notify";
import { orderChanged } from "@/lib/realtime";

const call = (status: string) =>
  POST(new Request("https://x/api/admin/orders/3/status", { method: "POST", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: "3" }) });

beforeEach(() => vi.clearAllMocks());

describe("starting assembly informs the customer", () => {
  it.each(["pending", "approved"])("%s → assembly stores the automatic chat message together with the stage and actual manager", async status => {
    db.order.findUnique.mockResolvedValue({ id: 3, customerId: 9, status, serviceStartedAt: null });
    expect((await call("assembly")).status).toBe(200);
    expect(db.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "assembly", serviceStartedAt: expect.any(Date), serviceManagerId: 1, serviceManagerName: "Ольга" }) }));
    expect(db.orderMessage.create).toHaveBeenCalledOnce();
    expect(db.orderMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 3, automatic: true, source: "customer", isFromPicker: true, text: expect.stringContaining("Начали собирать ваш заказ") }) });
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(3);
    expect(notifyOrderStatus).toHaveBeenCalledOnce();
    expect(orderChanged).toHaveBeenCalledWith(3, 9);
  });

  it("an earlier chat reply does not prevent the assembly message or replace the acknowledged manager", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, customerId: 9, status: "pending", serviceStartedAt: new Date(), serviceManagerId: 8 });
    expect((await call("assembly")).status).toBe(200);
    expect(db.orderMessage.create).toHaveBeenCalledOnce();
    const data = (db.order.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).not.toHaveProperty("serviceManagerId");
  });

  it("a repeated request after assembly started cannot duplicate the message or notification", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, customerId: 9, status: "pending" });
    expect((await call("assembly")).status).toBe(200);
    db.order.findUnique.mockResolvedValue({ id: 3, customerId: 9, status: "assembly" });
    expect((await call("assembly")).status).toBe(400);
    expect(db.orderMessage.create).toHaveBeenCalledOnce();
    expect(notifyOrderStatus).toHaveBeenCalledOnce();
  });

  it.each(["consultation", "payment"])("returning from %s keeps checks without repeating the first-assembly greeting", async status => {
    db.order.findUnique.mockResolvedValue({ id: 3, status });
    expect((await call("assembly")).status).toBe(200);
    expect(db.orderMessage.create).not.toHaveBeenCalled();
  });

  it.each(["no_contact", "cancelled", "exported"])("cannot resume %s by starting assembly or send its message", async status => {
    db.order.findUnique.mockResolvedValue({ id: 3, status });
    expect((await call("assembly")).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(notifyOrderStatus).not.toHaveBeenCalled();
  });

  it("failed transactions do not announce an assembly that did not commit", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "pending" });
    db.$transaction.mockRejectedValueOnce(new Error("commit failed"));
    await expect(call("assembly")).rejects.toThrow("commit failed");
    expect(notifyOrderStatus).not.toHaveBeenCalled();
    expect(orderChanged).not.toHaveBeenCalled();
  });
});

describe("status → payment", () => {
  it.each(["consultation", "payment", "pending"])("%s → assembly preserves completed checks and resets only confirmation", async (status) => {
    db.order.findUnique.mockResolvedValue({ id: 3, status, confirmRequestedAt: new Date(), customerConfirmed: true });
    expect((await call("assembly")).status).toBe(200);
    expect(db.orderItemCheck.deleteMany).not.toHaveBeenCalled();
    expect(db.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "assembly", customerConfirmed: false, confirmRequestedAt: null }) }));
  });

  it("returning to pending and then assembly does not wipe checks either", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "assembly" });
    expect((await call("pending")).status).toBe(200);
    db.order.findUnique.mockResolvedValue({ id: 3, status: "pending" });
    expect((await call("assembly")).status).toBe(200);
    expect(db.orderItemCheck.deleteMany).not.toHaveBeenCalled();
  });
  it("blocked while waiting for the customer's confirmation", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "consultation", confirmRequestedAt: new Date() });
    const r = await call("payment");
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("awaiting_confirmation");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("allowed once confirmed", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "consultation", confirmRequestedAt: null, customerConfirmed: true });
    expect((await call("payment")).status).toBe(200);
  });

  it("blocked when the customer hasn't confirmed the order yet", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "consultation", confirmRequestedAt: null, customerConfirmed: false });
    expect((await call("payment")).status).toBe(409);
  });

  it("not straight from «Сборка»: first «На проверке»", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "assembly", confirmRequestedAt: null, customerConfirmed: true });
    expect((await call("payment")).status).toBe(400);
  });

  it("«На проверке» asks the customer to confirm", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "assembly", confirmRequestedAt: null, customerConfirmed: true });
    expect((await call("consultation")).status).toBe(200);
    const data = (db.order.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.confirmRequestedAt).toBeInstanceOf(Date);
    expect(data.customerConfirmed).toBe(false);
  });

  it("other statuses are not blocked (e.g. cancel)", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "consultation", confirmRequestedAt: new Date() });
    expect((await call("cancelled")).status).toBe(200);
  });
});
