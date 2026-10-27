import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  notification: { createMany: vi.fn(async () => ({})) },
  pushToken: { findMany: vi.fn(), deleteMany: vi.fn(async () => ({})) },
  order: { findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { notify, notifyBonusesAccrued, notifyOrderStatus, plural } from "./notify";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  db.pushToken.findMany.mockResolvedValue([{ token: "ExponentPushToken[aaa]" }, { token: "ExponentPushToken[gone]" }]);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }),
  });
});

describe("notify", () => {
  it("saves the notification and pushes to every device; dead tokens are removed", async () => {
    const r = await notify([5, 5, 6], { kind: "order", title: "T", body: "B", link: "/order/1" });
    expect(r).toEqual({ customers: 2, devices: 1 });
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [
        { customerId: 5, kind: "order", title: "T", body: "B", link: "/order/1" },
        { customerId: 6, kind: "order", title: "T", body: "B", link: "/order/1" },
      ],
    });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent[0]).toMatchObject({ to: "ExponentPushToken[aaa]", title: "T", data: { link: "/order/1", kind: "order" }, channelId: "default" });
    expect(db.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["ExponentPushToken[gone]"] } } });
  });

  it("never throws when Expo is down", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(notify(1, { kind: "promo", title: "A", body: "B" })).resolves.toEqual({ customers: 1, devices: 0 });
  });
});

describe("order events", () => {
  it("status texts with the order link", async () => {
    db.order.findMany.mockResolvedValue([{ id: 42, customerId: 7 }]);
    await notifyOrderStatus(42, "payment");
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ customerId: 7, kind: "order", title: "Заказ №42 собран", link: "/order/42" })],
    });
  });

  it("unknown / pending status: nothing", async () => {
    await notifyOrderStatus(42, "pending");
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it("bonuses only when something was accrued", async () => {
    db.order.findUnique.mockResolvedValue({ customerId: 7, bonusesCollected: 0 });
    await notifyBonusesAccrued(3);
    expect(db.notification.createMany).not.toHaveBeenCalled();
    db.order.findUnique.mockResolvedValue({ customerId: 7, bonusesCollected: 122 });
    await notifyBonusesAccrued(3);
    expect(db.notification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ title: "Начислено 122 бонуса" })] });
  });

  it("plural", () => {
    expect([1, 2, 5, 11, 21, 104].map((n) => plural(n, "бонус", "бонуса", "бонусов"))).toEqual(["бонус", "бонуса", "бонусов", "бонусов", "бонус", "бонуса"]);
  });
});
