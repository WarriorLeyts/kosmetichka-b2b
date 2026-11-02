import { beforeEach, describe, expect, it, vi } from "vitest";

// LoginAttempt rows kept in memory, SmsCode counts set per test
const rows = new Map<string, { count: number; resetAt: Date }>();
const db = vi.hoisted(() => ({
  smsCode: { count: vi.fn(), findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
  loginAttempt: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const mail = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})) }));
vi.mock("@/lib/mail", () => mail);

const { POST } = await import("./route");

const req = (ip = "1.2.3.4", phone = "+79990001122") =>
  new Request("http://x/api/auth/sms/send", { method: "POST", headers: { "x-real-ip": ip }, body: JSON.stringify({ phone }) });

let phoneDay = 0;
let siteDay = 0;
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  phoneDay = 0;
  siteDay = 0;
  process.env.SMSAERO_EMAIL = "e";
  process.env.SMSAERO_API_KEY = "k";
  process.env.ADMIN_EMAIL = "boss@x.ru";
  db.smsCode.count.mockImplementation(async (a: { where: { phone?: string } }) => (a.where.phone ? phoneDay : siteDay));
  db.loginAttempt.findUnique.mockImplementation(async ({ where }: { where: { ip: string } }) => rows.get(where.ip) ?? null);
  db.loginAttempt.update.mockImplementation(async ({ where }: { where: { ip: string } }) => {
    rows.get(where.ip)!.count++;
  });
  db.loginAttempt.upsert.mockImplementation(async ({ where, create }: { where: { ip: string }; create: { count: number; resetAt: Date } }) => {
    rows.set(where.ip, { count: create.count, resetAt: create.resetAt });
  });
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ success: true }) })));
});

describe("SMS daily limits (P2-05)", () => {
  it("a normal request is sent", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("5 codes to one number in a day → refused, nothing sent", async () => {
    phoneDay = 5;
    const r = await POST(req());
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/завтра/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("300 codes on the whole site in a day → paused, the admin gets one e-mail", async () => {
    siteDay = 300;
    expect((await POST(req())).status).toBe(429);
    expect((await POST(req("5.6.7.8", "+79990003344"))).status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it("one IP: the 21st code in a day is refused even across hours", async () => {
    rows.set("sms_day_1.2.3.4", { count: 20, resetAt: new Date(Date.now() + 3_600_000) });
    expect((await POST(req())).status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
    expect((await POST(req("9.9.9.9"))).status).toBe(200);
  });
});
