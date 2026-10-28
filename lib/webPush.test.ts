import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  notification: { createMany: vi.fn(async () => ({})) },
  pushToken: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({})) },
  webPushSubscription: { findMany: vi.fn(), deleteMany: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { encryptPayload, getVapidConfig, validSubscriptionKeys, vapidJwt } from "./webPush";
import { notify } from "./notify";

// server VAPID keys
const vapid = crypto.createECDH("prime256v1");
vapid.generateKeys();
const pad32 = (b: Buffer) => Buffer.concat([Buffer.alloc(32 - b.length), b]);
const env = { ...process.env };
process.env.WEB_PUSH_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
process.env.WEB_PUSH_PRIVATE_KEY = pad32(vapid.getPrivateKey()).toString("base64url");
delete process.env.WEB_PUSH_SUBJECT;
afterAll(() => {
  process.env = env;
});

// browser (user agent) side
function makeBrowser() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url"), authBuf: auth };
}

/** RFC 8291 receiver: what the browser does with the push body. */
function decrypt(body: Buffer, ua: ReturnType<typeof makeBrowser>): Buffer {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  expect(rs).toBe(4096);
  expect(ct.length).toBeLessThanOrEqual(rs);
  const shared = ua.ecdh.computeSecret(asPublic);
  const h = (ikm: Buffer, s: Buffer, info: string | Buffer, n: number) => Buffer.from(crypto.hkdfSync("sha256", ikm, s, info, n));
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), ua.ecdh.getPublicKey(), asPublic]);
  const ikm = h(shared, ua.authBuf, keyInfo, 32);
  const cek = h(ikm, salt, "Content-Encoding: aes128gcm\0", 16);
  const nonce = h(ikm, salt, "Content-Encoding: nonce\0", 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  // strip padding: last non-zero byte must be the 0x02 delimiter
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  expect(plain[end]).toBe(2);
  return plain.subarray(0, end);
}

describe("encryption (aes128gcm)", () => {
  it("round-trips through the receiver side", () => {
    const ua = makeBrowser();
    const msg = Buffer.from(JSON.stringify({ title: "Заказ №42 оформлен", body: "Подробности — в заказе.", link: "/order/42" }));
    const body = encryptPayload(msg, ua.p256dh, ua.auth);
    expect(decrypt(body, ua).toString()).toBe(msg.toString());
  });

  it("matches the RFC 8291 appendix A test vector", () => {
    const as = crypto.createECDH("prime256v1");
    as.setPrivateKey(Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url"));
    const out = encryptPayload(
      Buffer.from("When I grow up, I want to be a watermelon"),
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      "BTBZMqHH6r4Tts7J_aSIgg",
      { salt: Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url"), serverKeys: as }
    );
    expect(out.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    );
  });

  it("fresh salt and ephemeral key per message", () => {
    const ua = makeBrowser();
    const a = encryptPayload(Buffer.from("x"), ua.p256dh, ua.auth);
    const b = encryptPayload(Buffer.from("x"), ua.p256dh, ua.auth);
    expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false);
    expect(a.subarray(21, 86).equals(b.subarray(21, 86))).toBe(false);
  });

  it("validates browser keys", () => {
    const ua = makeBrowser();
    expect(validSubscriptionKeys(ua.p256dh, ua.auth)).toBe(true);
    expect(validSubscriptionKeys("abc", ua.auth)).toBe(false);
    expect(validSubscriptionKeys(ua.p256dh, "abc")).toBe(false);
  });
});

describe("VAPID", () => {
  it("ES256 JWT for the endpoint origin, exp within 24h, verifies with the public key", () => {
    const cfg = getVapidConfig()!;
    expect(cfg.subject).toBe("mailto:noreply@kosmetichka-opt.ru");
    const now = Math.floor(Date.now() / 1000);
    const jwt = vapidJwt("https://fcm.googleapis.com/fcm/send/abc:def", cfg, now);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:noreply@kosmetichka-opt.ru");
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp - now).toBeLessThanOrEqual(24 * 3600);

    const pub = vapid.getPublicKey();
    const key = crypto.createPublicKey({
      key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") },
      format: "jwk",
    });
    const sig = Buffer.from(s, "base64url");
    expect(sig.length).toBe(64);
    expect(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });
});

describe("notify → web push", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("pushes to every browser of the customer; 410 subscriptions are deleted", async () => {
    const ua = makeBrowser();
    db.webPushSubscription.findMany.mockResolvedValue([
      { id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/ok", p256dh: ua.p256dh, auth: ua.auth },
      { id: 2, endpoint: "https://web.push.apple.com/gone", p256dh: ua.p256dh, auth: ua.auth },
    ]);
    fetchMock.mockImplementation(async (url: string) => ({
      status: url.endsWith("/gone") ? 410 : 201,
      ok: !url.endsWith("/gone"),
      text: async () => "",
    }));

    const r = await notify(7, { kind: "chat", title: "Сообщение по заказу №5", body: "Здравствуйте", link: "/order/5" });
    expect(r).toEqual({ customers: 1, devices: 1 });
    expect(db.webPushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: { in: [7] } } }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/ok"))!;
    expect(url).toBe("https://fcm.googleapis.com/fcm/send/ok");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Encoding": "aes128gcm", Urgency: "high" });
    expect(init.headers.TTL).toMatch(/^\d+$/);
    expect(init.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    const payload = JSON.parse(decrypt(Buffer.from(init.body), ua).toString());
    expect(payload).toMatchObject({ title: "Сообщение по заказу №5", body: "Здравствуйте", link: "/order/5", kind: "chat" });

    expect(db.webPushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] } } });
  });

  it("a failing push service never breaks notify()", async () => {
    const ua = makeBrowser();
    db.webPushSubscription.findMany.mockResolvedValue([{ id: 1, endpoint: "https://x.example/1", p256dh: ua.p256dh, auth: ua.auth }]);
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(notify(1, { kind: "promo", title: "A", body: "B" })).resolves.toEqual({ customers: 1, devices: 0 });
    expect(db.notification.createMany).toHaveBeenCalled();
  });

  it("database failure in web push never breaks notify()", async () => {
    db.webPushSubscription.findMany.mockRejectedValue(new Error("db"));
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
    await expect(notify(1, { kind: "order", title: "A", body: "B" })).resolves.toEqual({ customers: 1, devices: 0 });
  });
});
