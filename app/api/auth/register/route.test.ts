import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), syncCustomerCard: vi.fn(), notifyStaffLater: vi.fn(), setCookie: vi.fn(), verifyRegistrationEmail: vi.fn(), consumeRegistrationEmail: vi.fn() }));
const db = vi.hoisted(() => ({
  customer: { findFirst: vi.fn(), create: vi.fn() },
  oneCCustomer: { findMany: vi.fn() },
  smsCode: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/registrationEmail", () => ({ verifyRegistrationEmail: mocks.verifyRegistrationEmail, consumeRegistrationEmail: mocks.consumeRegistrationEmail }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/autoLinkCards", () => ({ syncCustomerCard: mocks.syncCustomerCard }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie }) }));
vi.mock("@/lib/auth", () => ({ createToken: async () => "token" }));
vi.mock("@/lib/staffNotify", () => ({ notifyStaffLater: mocks.notifyStaffLater }));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hashed" } }));
import { POST } from "./route";
const request = (extra = {}) => new Request("https://site/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Test", phone: "89991234567", email: "test@example.com", password: "password", priceType: "retail", captchaToken: "captcha", smsCode: "123456", ...extra }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SMARTCAPTCHA_SERVER_KEY", "test");
  vi.stubEnv("JWT_SECRET", "registration-test-only");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "ok" })));
  db.customer.findFirst.mockResolvedValue(null);
  db.customer.create.mockResolvedValue({ id: 1, email: "test@example.com" });
  db.oneCCustomer.findMany.mockResolvedValue([]);
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
    db.oneCCustomer.findMany.mockResolvedValue([{ priceType: "wholesale", manager: "Бимарзаева Раяна" }]);
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
    expect(db.oneCCustomer.findMany).not.toHaveBeenCalled();
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


describe("existing 1C customers in manager groups", () => {
  const wholesale = (extra = {}) => request({ priceType: "wholesale", address: "Test address", shopType: "online", ...extra });
  it("does not automatically bind or approve an ambiguous phone", async () => {
    db.oneCCustomer.findMany.mockResolvedValue([{ oneCId: "a", manager: "Бимарзаева Раяна" }, { oneCId: "b", manager: "Даудова Радима" }]);
    expect(await (await POST(wholesale())).json()).toMatchObject({ autoLogin: false, oneCLinked: false });
    expect(db.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ oneCId: null, manager: null, isApproved: false }) });
    expect(db.oneCCustomer.findMany).toHaveBeenCalledWith({ where: { OR: [{ phone: "89991234567" }, { phones: { has: "89991234567" } }] }, take: 2 });
  });
  it.each([null, "", "retail", "discount", "wholesale", "big_wholesale"])("approves a verified existing customer with 1C price type %s", async (priceType) => {
    db.oneCCustomer.findMany.mockResolvedValue([{ oneCId: "existing-1c", manager: "Бимарзаева Раяна", priceType }]);
    const res = await POST(wholesale());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ autoLogin: true, oneCLinked: true });
    expect(db.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isApproved: true, oneCId: "existing-1c", manager: "Бимарзаева Раяна", priceType: "wholesale", wholesaleAccess: "wholesale" }) });
    expect(mocks.setCookie).toHaveBeenCalledWith("auth_token", "token", expect.any(Object));
    expect(mocks.notifyStaffLater).not.toHaveBeenCalled();
  });
  it.each([null, "", "Другая группа"])("keeps wholesale approval manual outside imported groups (%s)", async (manager) => {
    db.oneCCustomer.findMany.mockResolvedValue([{ oneCId: "other-1c", manager, priceType: "wholesale" }]);
    const res = await POST(wholesale());
    expect(await res.json()).toMatchObject({ autoLogin: false, proofToken: expect.any(String) });
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.notifyStaffLater).toHaveBeenCalled();
  });
  it("keeps a new wholesale customer in manual review", async () => {
    const res = await POST(wholesale());
    expect(await res.json()).toMatchObject({ autoLogin: false, oneCLinked: false });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("does not grant big wholesale automatically to an existing customer", async () => {
    db.oneCCustomer.findMany.mockResolvedValue([{ oneCId: "existing-1c", manager: "Бимарзаева Раяна", priceType: "big_wholesale" }]);
    expect(await (await POST(wholesale({ priceType: "big_wholesale" }))).json()).toMatchObject({ autoLogin: true });
    expect(db.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ priceType: "wholesale", isApproved: true, roleRequest: "big_wholesale", roleRequestStatus: "pending" }) });
    expect(mocks.notifyStaffLater).toHaveBeenCalledWith(expect.objectContaining({ request: "big_wholesale" }));
  });
  it("never looks up or approves a 1C match without a valid SMS code", async () => {
    db.smsCode.findFirst.mockResolvedValue(null);
    expect((await POST(wholesale())).status).toBe(400);
    expect(db.oneCCustomer.findMany).not.toHaveBeenCalled();
    expect(db.customer.create).not.toHaveBeenCalled();
  });
});

describe("registration proof delivery", () => {
  const wholesale = (extra = {}) => request({ priceType: "wholesale", address: "Test address", shopType: "online", proofCount: 2, ...extra });
  it("records the selected files and defers the application notification until completion", async () => {
    const response = await POST(wholesale());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ autoLogin: false, proofCustomerId: 1, proofToken: expect.any(String) });
    expect(db.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ proofUploadExpected: 2, proofUploadCompletedAt: null, isApproved: false }) });
    expect(mocks.notifyStaffLater).not.toHaveBeenCalled();
  });
  it("returns an upload pass even after automatic approval through a 1C manager group", async () => {
    db.oneCCustomer.findMany.mockResolvedValue([{ oneCId: "existing-1c", manager: "Бимарзаева Раяна", priceType: "wholesale" }]);
    expect(await (await POST(wholesale())).json()).toMatchObject({ autoLogin: true, proofCustomerId: 1, proofToken: expect.any(String) });
    expect(mocks.setCookie).toHaveBeenCalled();
    expect(mocks.notifyStaffLater).not.toHaveBeenCalled();
  });
  it.each([0, -1, 11, 1.5, "invalid"])("rejects invalid proof count %s without creating an account or spending the SMS", async proofCount => {
    expect((await POST(wholesale({ proofCount }))).status).toBe(400);
    expect(db.customer.create).not.toHaveBeenCalled();
    expect(db.smsCode.update).not.toHaveBeenCalled();
  });
});
