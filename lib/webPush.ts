import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Browser Web Push without dependencies: VAPID (RFC 8292) + aes128gcm payload encryption
 * (RFC 8291 / RFC 8188), sent with fetch. Disabled when WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY
 * are not set. Never throws from sendWebPushToCustomers.
 */

export type VapidConfig = { publicKey: Buffer; privateKey: crypto.KeyObject; subject: string };
export type WebPushPayload = { title: string; body: string; link: string | null; kind: string; tag?: string; /** in-app path for the staff app (its base URL is added by the service worker) */ path?: string };
type Sub = { id: number; endpoint: string; p256dh: string; auth: string };

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

let cached: { key: string; cfg: VapidConfig | null } | null = null;

/** Reads the VAPID keys from env; null (web push off) when unset or malformed. */
export function getVapidConfig(): VapidConfig | null {
  const pub = process.env.WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const priv = process.env.WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:noreply@kosmetichka-opt.ru";
  const key = `${pub}|${priv}|${subject}`;
  if (cached?.key === key) return cached.cfg;
  let cfg: VapidConfig | null = null;
  if (pub && priv) {
    try {
      const p = fromB64u(pub);
      const d = fromB64u(priv);
      if (p.length !== 65 || p[0] !== 4 || d.length !== 32) throw new Error("bad key length");
      const privateKey = crypto.createPrivateKey({
        key: { kty: "EC", crv: "P-256", x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33)), d: b64u(d) },
        format: "jwk",
      });
      cfg = { publicKey: p, privateKey, subject };
    } catch (e) {
      console.error("[web-push] invalid VAPID keys:", e instanceof Error ? e.message : e);
    }
  }
  cached = { key, cfg };
  return cfg;
}

/** ES256 JWT for the push service origin (valid 12h). */
export function vapidJwt(endpoint: string, cfg: VapidConfig, nowSec = Math.floor(Date.now() / 1000)): string {
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: cfg.subject })));
  const data = `${header}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: cfg.privateKey, dsaEncoding: "ieee-p1363" });
  return `${data}.${b64u(sig)}`;
}

const jwtCache = new Map<string, { token: string; exp: number }>();
function vapidHeader(endpoint: string, cfg: VapidConfig): string {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  let hit = jwtCache.get(aud);
  if (!hit || hit.exp - now < 3600) {
    hit = { token: vapidJwt(endpoint, cfg, now), exp: now + 12 * 3600 };
    jwtCache.set(aud, hit);
  }
  return `vapid t=${hit.token}, k=${b64u(cfg.publicKey)}`;
}

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, len: number) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

/** RFC 8291 aes128gcm body (single record). `salt` / `serverKeys` are for tests only. */
export function encryptPayload(
  plaintext: Buffer,
  p256dh: string,
  authSecret: string,
  opts: { salt?: Buffer; serverKeys?: crypto.ECDH } = {}
): Buffer {
  const uaPublic = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  const ecdh = opts.serverKeys ?? crypto.createECDH("prime256v1");
  if (!opts.serverKeys) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ?? crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(shared, auth, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 = padding delimiter of the last (only) record
  const enc = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

/** Basic shape check for keys coming from the browser. */
export function validSubscriptionKeys(p256dh: string, auth: string): boolean {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth)) return false;
  const p = fromB64u(p256dh);
  return p.length === 65 && p[0] === 4 && fromB64u(auth).length === 16;
}

/** Sends one push; returns the HTTP status (0 on network error). */
export async function sendWebPush(sub: Sub, payload: WebPushPayload, cfg: VapidConfig, urgency: "high" | "normal" = "high"): Promise<number> {
  try {
    const body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidHeader(sub.endpoint, cfg),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(3 * 24 * 3600),
        Urgency: urgency,
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 400 && res.status !== 404 && res.status !== 410) {
      const text = await res.text().catch(() => "");
      console.error("[web-push]", new URL(sub.endpoint).host, res.status, text.slice(0, 200));
    }
    return res.status;
  } catch (e) {
    console.error("[web-push] send failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Sends to these subscriptions (10 at a time). Returns delivered count and the ids the push service says are gone (404/410). */
export async function sendToSubscriptions(
  subs: Sub[],
  payload: WebPushPayload,
  cfg: VapidConfig,
  urgency: "high" | "normal" = "high"
): Promise<{ ok: number; gone: number[] }> {
  let ok = 0;
  const gone: number[] = [];
  let next = 0;
  const worker = async () => {
    while (next < subs.length) {
      const s = subs[next++];
      const status = await sendWebPush(s, payload, cfg, urgency);
      if (status >= 200 && status < 300) ok++;
      else if (status === 404 || status === 410) gone.push(s.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, subs.length) }, worker));
  return { ok, gone };
}

/** Pushes to every browser of these customers; gone subscriptions are deleted. Returns delivered count. */
export async function sendWebPushToCustomers(customerIds: number[], payload: WebPushPayload, urgency: "high" | "normal" = "high"): Promise<number> {
  const cfg = getVapidConfig();
  if (!cfg || customerIds.length === 0) return 0;
  try {
    const subs: Sub[] = await prisma.webPushSubscription.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    const { ok, gone } = await sendToSubscriptions(subs, payload, cfg, urgency);
    if (gone.length) await prisma.webPushSubscription.deleteMany({ where: { id: { in: gone } } });
    return ok;
  } catch (e) {
    console.error("[web-push] failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/** Validates a PushSubscription.toJSON() body from the browser: https endpoint (≤1000 chars) + P-256 / 16-byte keys. */
export function parseSubscription(body: unknown): SubscriptionInput | null {
  const b = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
  const p256dh = typeof b.keys?.p256dh === "string" ? b.keys.p256dh : "";
  const auth = typeof b.keys?.auth === "string" ? b.keys.auth : "";
  let okUrl = false;
  try {
    const u = new URL(endpoint);
    okUrl = endpoint.length <= 1000 && u.protocol === "https:" && !u.username && !u.password;
  } catch {}
  if (!okUrl || !validSubscriptionKeys(p256dh, auth)) return null;
  return { endpoint, p256dh, auth };
}
