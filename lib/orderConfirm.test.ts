import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ order: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const n = vi.hoisted(() => ({ notify: vi.fn(async () => ({ customers: 1, devices: 1 })) }));
vi.mock("@/lib/notify", () => n);

import { isAwaiting, sendConfirmReminders } from "./orderConfirm";

beforeEach(() => vi.clearAllMocks());

describe("confirmation reminders", () => {
  it("first reminder after 2 h, second after 24 h; each claimed once", async () => {
    const now = new Date("2026-10-28T12:00:00Z");
    db.order.findMany.mockResolvedValueOnce([{ id: 5, customerId: 9 }]).mockResolvedValueOnce([{ id: 6, customerId: 8 }]);
    db.order.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); // order 6 taken by another server
    expect(await sendConfirmReminders(now)).toBe(1);
    const [first, second] = db.order.findMany.mock.calls.map((c) => c[0].where);
    expect(first).toMatchObject({ confirmReminders: 0, confirmRequestedAt: { lte: new Date("2026-10-28T10:00:00Z") } });
    expect(second).toMatchObject({ confirmReminders: 1, confirmRequestedAt: { lte: new Date("2026-10-27T12:00:00Z") } });
    expect(n.notify).toHaveBeenCalledTimes(1);
    expect(n.notify).toHaveBeenCalledWith(9, expect.objectContaining({ title: "Подтвердите изменения в заказе №5", link: "/order/5" }));
  });

  it("never throws", async () => {
    db.order.findMany.mockRejectedValue(new Error("db down"));
    expect(await sendConfirmReminders()).toBe(0);
  });

  it("isAwaiting", () => {
    expect(isAwaiting({ confirmRequestedAt: new Date() })).toBe(true);
    expect(isAwaiting({ confirmRequestedAt: null })).toBe(false);
  });
});
