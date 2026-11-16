import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ registrationEmailCode: { updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() } }));
const io = vi.hoisted(() => ({ sendMail: vi.fn(), checkLoginAttempt: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/mail", () => ({ sendMail: io.sendMail }));
vi.mock("@/lib/loginAttempts", () => ({ checkLoginAttempt: io.checkLoginAttempt }));
vi.mock("@/lib/jwtSecret", () => ({ resolveJwtSecret: () => "test-secret" }));
import { POST } from "./route";
const call = (phone = "+995 555 123 456", email = " Client@Example.com ") => POST(new Request("https://site/api/auth/email/send", { method: "POST", body: JSON.stringify({ phone, email }) }));
beforeEach(() => { vi.resetAllMocks(); io.checkLoginAttempt.mockResolvedValue(true); });
describe("email registration code delivery", () => {
  it("sends a six-digit code, stores only its hash and returns a challenge id", async () => {
    const response = await POST(new Request("https://site/api/auth/email/send", { method: "POST", body: JSON.stringify({ phone: "+995 555 123 456", email: "Client@Example.com" }) }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.challengeId).toBeTruthy();
    expect(result.code).toBeUndefined();
    expect(io.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "client@example.com", html: expect.stringMatching(/\d{6}/) }));
    const data = db.registrationEmailCode.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "client@example.com", phone: "+995555123456", codeHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(data.code).toBeUndefined();
  });
  it.each(["+79154509717", "995555123456", "+000", "+995<script>"])("rejects invalid foreign phone %s", async phone => {
    expect((await call(phone)).status).toBe(400);
    expect(io.sendMail).not.toHaveBeenCalled();
  });
  it("rejects invalid email", async () => {
    expect((await call("+995555123456", "bad")).status).toBe(400);
    expect(io.sendMail).not.toHaveBeenCalled();
  });
  it("limits repeated sending", async () => {
    io.checkLoginAttempt.mockResolvedValue(false);
    expect((await call()).status).toBe(429);
    expect(io.sendMail).not.toHaveBeenCalled();
  });
  it("invalidates an undelivered code and reports mail failure", async () => {
    io.sendMail.mockRejectedValue(new Error("SMTP down"));
    expect((await call()).status).toBe(503);
    expect(db.registrationEmailCode.updateMany).toHaveBeenLastCalledWith({ where: { id: expect.any(String) }, data: { used: true } });
  });
});
