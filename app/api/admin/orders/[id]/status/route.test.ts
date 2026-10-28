/** «Заказ оформлен» (payment) only after the customer confirmed the order sent «На проверке». */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: 1, role: "manager" })) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/maxmaOrders", () => ({ onOrderStatus: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: vi.fn() }));
const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  orderItem: { findMany: vi.fn(async () => []) },
  orderItemCheck: { deleteMany: vi.fn() },
  orderStatusLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";

const call = (status: string) =>
  POST(new Request("https://x/api/admin/orders/3/status", { method: "POST", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: "3" }) });

beforeEach(() => vi.clearAllMocks());

describe("status → payment", () => {
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
