import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  customer: { findUnique: vi.fn(), findFirst: vi.fn(async () => null), update: vi.fn(async () => ({ id: 1 })) },
  smsCode: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../_auth", () => ({ currentCustomerId: async () => 1 }));
vi.mock("@/lib/customerAuth", () => ({ renewCustomerSession: vi.fn() }));

const { PATCH } = await import("./route");
const patch = (body: object) => PATCH(new Request("https://x.ru/api/mobile/profile", { method: "PATCH", body: JSON.stringify(body) }));
const form = { name: "Анна", email: "a@b.ru", phone: "89001112233" };

beforeEach(() => {
  vi.clearAllMocks();
  db.customer.findUnique.mockResolvedValue({ phone: "89001112233", email: "a@b.ru" });
});

describe("changing the phone needs the SMS code", () => {
  it("same phone (other format) → saved without a code", async () => {
    const r = await patch({ ...form, phone: "+7 900 111-22-33" });
    expect(r.status).toBe(200);
    expect(db.smsCode.findFirst).not.toHaveBeenCalled();
  });
  it("new phone without a code → refused", async () => {
    const r = await patch({ ...form, phone: "89005556677" });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("phone_code_required");
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it("wrong code → refused; right code → saved and the code spent", async () => {
    db.smsCode.findFirst.mockResolvedValueOnce(null);
    expect((await (await patch({ ...form, phone: "89005556677", smsCode: "123456" })).json()).code).toBe("phone_code_wrong");
    db.smsCode.findFirst.mockResolvedValueOnce({ id: 9 });
    const ok = await patch({ ...form, phone: "89005556677", smsCode: "123456" });
    expect(ok.status).toBe(200);
    expect(db.smsCode.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ phone: "79005556677", code: "123456" }) }));
    expect(db.smsCode.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { used: true } });
  });
});
