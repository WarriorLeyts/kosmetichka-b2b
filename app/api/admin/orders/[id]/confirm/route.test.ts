/** A manager / admin confirms for the customer: only while the order waits for the check; the chat says who. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: { id: 3, role: "manager" } as { id: number; role: string } | null }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => auth.user) }));
vi.mock("@/lib/orderLock", () => ({ lockedByOrderId: (fn: unknown) => fn }));
vi.mock("@/lib/staffNotify", () => ({ notifyStaffLater: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  user: { findUnique: vi.fn(async () => ({ id: 3, name: "Мадина" })) },
  orderMessage: { create: vi.fn(async (_a: { data: { text: string; userId?: number } }) => ({})) },
}));
vi.mock("@/lib/staffScope", async (orig) => ({ ...(await orig<typeof import("@/lib/staffScope")>()), staffSeesOrder: async () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";

const call = () => POST(new Request("https://x", { method: "POST" }), { params: Promise.resolve({ id: "9" }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 3, role: "manager" };
});

describe("staff confirm", () => {
  it("confirms a waiting order and writes who did it", async () => {
    db.order.findUnique.mockResolvedValue({ id: 9, status: "consultation", confirmRequestedAt: new Date(), customerConfirmed: false });
    expect((await call()).status).toBe(200);
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { customerConfirmed: true, confirmRequestedAt: null } });
    const msg = (db.orderMessage.create.mock.calls[0] as [{ data: { text: string; userId?: number } }])[0].data;
    expect(msg.userId).toBe(3);
    expect(msg.text).toContain("Мадина");
  });
  it("not when nothing waits for the customer", async () => {
    db.order.findUnique.mockResolvedValue({ id: 9, status: "assembly", confirmRequestedAt: null, customerConfirmed: false });
    expect((await call()).status).toBe(400);
    expect(db.order.update).not.toHaveBeenCalled();
  });
  it("only signed-in admin / manager", async () => {
    auth.user = null;
    expect((await call()).status).toBe(401);
  });
});
