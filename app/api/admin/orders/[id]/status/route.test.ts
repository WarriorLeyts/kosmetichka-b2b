/** «Заказ оформлен» (payment) is refused while the customer hasn't confirmed staff changes. */
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
    db.order.findUnique.mockResolvedValue({ id: 3, status: "consultation", confirmRequestedAt: null });
    expect((await call("payment")).status).toBe(200);
  });

  it("other statuses are not blocked (e.g. cancel)", async () => {
    db.order.findUnique.mockResolvedValue({ id: 3, status: "consultation", confirmRequestedAt: new Date() });
    expect((await call("cancelled")).status).toBe(200);
  });
});
