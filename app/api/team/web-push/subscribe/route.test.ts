import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { id: 3, login: "olga", role: "manager" } as { id: number; login: string; role: string } | null }));
vi.mock("../../_auth", () => ({
  ANY_STAFF: ["admin", "manager", "picker"],
  requireStaff: vi.fn(async () =>
    session.value
      ? { ok: true, session: session.value }
      : { ok: false, response: new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401 }) }
  ),
}));
const db = vi.hoisted(() => ({
  staffWebPushSubscription: { upsert: vi.fn(async () => ({})), findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";
import { parseSubscription } from "@/lib/webPush";

const vapid = crypto.createECDH("prime256v1");
vapid.generateKeys();
const env = { ...process.env };
process.env.WEB_PUSH_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
process.env.WEB_PUSH_PRIVATE_KEY = Buffer.concat([Buffer.alloc(32 - vapid.getPrivateKey().length), vapid.getPrivateKey()]).toString("base64url");
afterAll(() => {
  process.env = env;
});

const ua = crypto.createECDH("prime256v1");
ua.generateKeys();
const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") } };
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://x/api/team/web-push/subscribe", { method: "POST", body: JSON.stringify(body), headers }));

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { id: 3, login: "olga", role: "manager" };
});

describe("parseSubscription", () => {
  it("accepts a browser subscription, rejects bad ones", () => {
    expect(parseSubscription(good)).toEqual({ endpoint: good.endpoint, ...good.keys });
    expect(parseSubscription({ ...good, endpoint: "http://fcm.googleapis.com/x" })).toBeNull();
    expect(parseSubscription({ ...good, endpoint: "https://u:p@evil.example/x" })).toBeNull();
    expect(parseSubscription({ ...good, endpoint: "https://a.example/" + "x".repeat(1000) })).toBeNull();
    expect(parseSubscription({ ...good, keys: { p256dh: "abc", auth: good.keys.auth } })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});

describe("POST /api/team/web-push/subscribe", () => {
  it("saves the subscription for the signed-in staff member", async () => {
    const r = await call(good, { "user-agent": "Safari" });
    expect(r.status).toBe(200);
    expect(db.staffWebPushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: good.endpoint }, create: expect.objectContaining({ userId: 3, userAgent: "Safari", p256dh: good.keys.p256dh }) })
    );
  });

  it("401 when not signed in", async () => {
    session.value = null;
    expect((await call(good)).status).toBe(401);
    expect(db.staffWebPushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("400 on a bad subscription, 403 from another site", async () => {
    expect((await call({ endpoint: "nope" })).status).toBe(400);
    expect((await call(good, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(db.staffWebPushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("keeps at most 10 browsers per account", async () => {
    db.staffWebPushSubscription.findMany.mockResolvedValueOnce([{ id: 99 }] as never);
    await call(good);
    expect(db.staffWebPushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [99] } } });
  });
});
