import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ registrationEmailCode: { updateMany: vi.fn(), findUnique: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("./jwtSecret", () => ({ resolveJwtSecret: () => "test-secret" }));
import { emailCodeHash, verifyRegistrationEmail, consumeRegistrationEmail } from "./registrationEmail";
const email = "client@example.com", phone = "+995555123456";
beforeEach(() => {
  vi.resetAllMocks();
  db.registrationEmailCode.updateMany.mockResolvedValue({ count: 1 });
  db.registrationEmailCode.findUnique.mockResolvedValue({ codeHash: emailCodeHash("id", email, phone, "123456") });
});
describe("email verification challenge", () => {
  it("accepts a correct code only for the bound email and phone within five attempts", async () => {
    expect(await verifyRegistrationEmail("id", email, phone, "123456")).toBe("id");
    expect(db.registrationEmailCode.updateMany).toHaveBeenCalledWith({ where: { id: "id", email, phone, used: false, attempts: { lt: 5 }, expiresAt: { gt: expect.any(Date) } }, data: { attempts: { increment: 1 } } });
  });
  it("rejects incorrect guesses and changed identity", async () => {
    expect(await verifyRegistrationEmail("id", email, phone, "654321")).toBeNull();
    expect(emailCodeHash("id", "other@example.com", phone, "123456")).not.toBe(emailCodeHash("id", email, phone, "123456"));
    expect(emailCodeHash("id", email, "+995555000000", "123456")).not.toBe(emailCodeHash("id", email, phone, "123456"));
  });
  it("rejects expired, spent or exhausted challenges before checking the hash", async () => {
    db.registrationEmailCode.updateMany.mockResolvedValue({ count: 0 });
    expect(await verifyRegistrationEmail("id", email, phone, "123456")).toBeNull();
    expect(db.registrationEmailCode.findUnique).not.toHaveBeenCalled();
  });
  it("consumes a challenge atomically, refusing concurrent replay", async () => {
    db.registrationEmailCode.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await consumeRegistrationEmail("id")).toBe(true);
    expect(await consumeRegistrationEmail("id")).toBe(false);
  });
});
