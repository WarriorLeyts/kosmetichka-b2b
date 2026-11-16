import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), syncCustomerCard: vi.fn(), setCookie: vi.fn(), verifyRegistrationEmail: vi.fn(), consumeRegistrationEmail: vi.fn() }));
const db = vi.hoisted(() => ({
  customer: { findFirst: vi.fn(), create: vi.fn() },
  oneCCustomer: { findFirst: vi.fn() },
  smsCode: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/registrationEmail", () => ({ verifyRegistrationEmail: mocks.verifyRegistrationEmail, consumeRegistrationEmail: mocks.consumeRegistrationEmail }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/autoLinkCards", () => ({ syncCustomerCard: mocks.syncCustomerCard }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie }) }));
vi.mock("@/lib/auth", () => ({ createToken: async () => "token" }));
vi.mock("@/lib/staffNotify", () => ({ notifyStaffLater: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hashed" } }));
import { POST } from "./route";
const request = (extra = {}) => new Request("https://site/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Test", phone: "89991234567", email: "test@example.com", password: "password", priceType: "retail", captchaToken: "captcha", smsCode: "123456", ...extra }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SMARTCAPTCHA_SERVER_KEY", "test");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "ok" })));
  db.customer.findFirst.mockResolvedValue(null);
  db.customer.create.mockResolvedValue({ id: 1, email: "test@example.com" });
  db.oneCCustomer.findFirst.mockResolvedValue(null);
  db.smsCode.findFirst.mockResolvedValue({ id: 7 });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("registration card discovery", () => {
  it("schedules card discovery after successful registration, without waiting for external services", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, autoLogin: true });
    expect(db.smsCode.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { used: true } });
    expect(db.customer.create).toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.syncCustomerCard).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.syncCustomerCard).toHaveBeenCalledWith(1);
  });
  it("never searches cards before phone verification", async () => {
    db.smsCode.findFirst.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(db.customer.create).not.toHaveBeenCalled();
  });
  it("does not schedule discovery for an existing account", async () => {
    db.customer.findFirst.mockResolvedValue({ id: 2, isApproved: true });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("does not schedule retail card discovery when 1C identifies the account as wholesale", async () => {
    db.oneCCustomer.findFirst.mockResolvedValue({ priceType: "wholesale" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("registration by email for foreign contact numbers", () => {
  const foreign = () => request({ foreignPhone: true, phone: "+995 555 123 456", emailChallengeId: "challenge", emailCode: "123456", smsCode: "" });
  it("verifies email, saves a contact-only international phone and never auto-links identities", async () => {
    mocks.verifyRegistrationEmail.mockResolvedValue("challenge");
    mocks.consumeRegistrationEmail.mockResolvedValue(true);
    expect((await POST(foreign())).status).toBe(200);
    expect(mocks.verifyRegistrationEmail).toHaveBeenCalledWith("challenge", "test@example.com", "+995555123456", "123456");
    expect(db.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ phone: "+995555123456", phoneUnverified: true }) });
    expect(db.smsCode.findFirst).not.toHaveBeenCalled();
    expect(db.oneCCustomer.findFirst).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("rejects an incorrect email code", async () => {
    mocks.verifyRegistrationEmail.mockResolvedValue(null);
    expect((await POST(foreign())).status).toBe(400);
    expect(db.customer.create).not.toHaveBeenCalled();
  });
  it("rejects replay of a consumed email challenge", async () => {
    mocks.verifyRegistrationEmail.mockResolvedValue("challenge");
    mocks.consumeRegistrationEmail.mockResolvedValue(false);
    expect((await POST(foreign())).status).toBe(400);
    expect(db.customer.create).not.toHaveBeenCalled();
  });
  it("does not allow the email mode for a +7 phone", async () => {
    expect((await POST(request({ foreignPhone: true, phone: "+79154509717" }))).status).toBe(400);
    expect(mocks.verifyRegistrationEmail).not.toHaveBeenCalled();
  });
  it("cannot take over a stale application using an unverified phone and a different email", async () => {
    mocks.verifyRegistrationEmail.mockResolvedValue("challenge");
    db.customer.findFirst.mockResolvedValue({ id: 2, isActive: true, isApproved: false, requestStaleAt: new Date(), phone: "+995555123456", email: "owner@example.com" });
    expect((await POST(foreign())).status).toBe(400);
    expect(db.customer.create).not.toHaveBeenCalled();
  });
});
