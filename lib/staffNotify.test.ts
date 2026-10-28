import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  staffWebPushSubscription: { findMany: vi.fn(), deleteMany: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { chatPreview, notifyStaff, notifyStaffLater, staffPayload } from "./staffNotify";

const vapid = crypto.createECDH("prime256v1");
vapid.generateKeys();
const pad32 = (b: Buffer) => Buffer.concat([Buffer.alloc(32 - b.length), b]);
const env = { ...process.env };
process.env.WEB_PUSH_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
process.env.WEB_PUSH_PRIVATE_KEY = pad32(vapid.getPrivateKey()).toString("base64url");
afterAll(() => {
  process.env = env;
});

function browser() {
  const e = crypto.createECDH("prime256v1");
  e.generateKeys();
  return { p256dh: e.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  db.order.findUnique.mockResolvedValue({ id: 42, total: 12345, customerId: 7, customer: { name: "Анна", companyName: "ИП Анна", phone: null } });
});

describe("staff payloads", () => {
  it("new order: number, client, sum, admin link", async () => {
    const p = await staffPayload({ kind: "new-order", orderId: 42 });
    expect(p).toMatchObject({ title: "Новый заказ №42", body: "ИП Анна · 12 345 ₽", link: "/admin/order/42", path: "/order/42" });
  });

  it("chat: text preview; product request card", async () => {
    expect((await staffPayload({ kind: "chat", orderId: 42, text: "Здравствуйте,\n можно быстрее?" }))?.body).toBe("ИП Анна: Здравствуйте, можно быстрее?");
    const card = JSON.stringify({ _t: "product-request", id: 1, name: "Крем", variantName: "50 мл", quantity: 3, price: 100 });
    expect(chatPreview(card)).toBe("🛒 Клиент просит добавить: Крем — 50 мл × 3");
    expect(chatPreview(JSON.stringify({ _t: "img", url: "/api/uploads/chat/a.jpg" }))).toBe("📷 Фото");
    expect(chatPreview("x".repeat(500)).length).toBeLessThanOrEqual(180);
  });

  it("confirmed / cancelled titles", async () => {
    expect((await staffPayload({ kind: "confirmed", orderId: 42 }))?.title).toBe("Клиент подтвердил заказ №42");
    expect((await staffPayload({ kind: "cancelled", orderId: 42 }))?.title).toBe("Клиент отменил заказ №42");
  });
});

describe("notifyStaff", () => {
  it("admin/manager subscriptions only, skips the actor, deletes gone ones", async () => {
    const b = browser();
    db.staffWebPushSubscription.findMany.mockResolvedValue([
      { id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/ok", ...b },
      { id: 2, endpoint: "https://web.push.apple.com/gone", ...b },
    ]);
    fetchMock.mockImplementation(async (url: string) => ({ status: url.endsWith("/gone") ? 410 : 201, text: async () => "" }));
    expect(await notifyStaff({ kind: "new-order", orderId: 42 }, { exceptUserId: 5 })).toBe(1);
    expect(db.staffWebPushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { role: { in: ["admin", "manager"] } }, userId: { not: 5 } } })
    );
    expect(db.staffWebPushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] } } });
  });

  it("no subscriptions → no order lookup, no fetch", async () => {
    db.staffWebPushSubscription.findMany.mockResolvedValue([]);
    expect(await notifyStaff({ kind: "chat", orderId: 42, text: "a" })).toBe(0);
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws (db down, push service down)", async () => {
    db.staffWebPushSubscription.findMany.mockRejectedValue(new Error("db"));
    await expect(notifyStaff({ kind: "cancelled", orderId: 42 })).resolves.toBe(0);
    db.staffWebPushSubscription.findMany.mockResolvedValue([{ id: 1, endpoint: "https://x.example/1", ...browser() }]);
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(notifyStaff({ kind: "confirmed", orderId: 42 })).resolves.toBe(0);
    expect(() => notifyStaffLater({ kind: "new-order", orderId: 1 })).not.toThrow();
  });

  it("off without VAPID keys", async () => {
    const pub = process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    expect(await notifyStaff({ kind: "new-order", orderId: 42 })).toBe(0);
    expect(db.staffWebPushSubscription.findMany).not.toHaveBeenCalled();
    process.env.WEB_PUSH_PUBLIC_KEY = pub;
  });
});
