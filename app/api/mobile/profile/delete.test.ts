import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ id: 7 as number | null, passwordOK: true }));
const db = vi.hoisted(() => {
  const remove = () => ({ deleteMany: vi.fn(async () => ({ count: 1 })) });
  return { customer: { findUnique: vi.fn(), update: vi.fn(async () => ({})) }, wishlistItem: remove(), customerCart: remove(), customerFavorites: remove(), customerProof: remove(), orderReview: remove(), pushToken: remove(), webPushSubscription: remove(), notification: remove(), passwordResetToken: remove(), $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)) };
});
const io = vi.hoisted(() => ({ unlink: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../_auth", () => ({ currentCustomerId: async () => state.id }));
vi.mock("@/lib/proofs", () => ({ PROOF_DIR: "/private-proofs" }));
vi.mock("fs/promises", () => io);
vi.mock("bcryptjs", () => ({ default: { compare: async () => state.passwordOK, hash: async () => "revoked-password" } }));
import { DELETE } from "./route";
const call = (body: unknown = { password: "correct" }) => DELETE(new Request("https://site/api/mobile/profile", { method: "DELETE", body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); state.id = 7; state.passwordOK = true; db.customer.findUnique.mockResolvedValue({ password: "hash", email: "customer@example.test", proofs: [{ file: "p.jpg" }, { file: "../another.jpg" }] }); });
describe("customer account deletion", () => {
  it("requires an authenticated customer", async () => {
    state.id = null;
    expect((await call()).status).toBe(401);
    expect(db.customer.update).not.toHaveBeenCalled();
  });
  it.each([{}, { password: "wrong" }])("does not erase anything without the correct password: %j", async (body) => {
    state.passwordOK = false;
    expect((await call(body)).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(io.unlink).not.toHaveBeenCalled();
  });
  it("erases saved lists and wholesale proofs, revokes access, retains order accounting, and expires the cookie", async () => {
    const r = await call({ password: "correct", customerId: 999 });
    expect(r.status).toBe(200);
    expect(db.orderReview.deleteMany).toHaveBeenCalledWith({ where: { order: { customerId: 7 } } });
    for (const model of [db.customerCart, db.customerFavorites, db.customerProof, db.wishlistItem, db.pushToken, db.webPushSubscription, db.notification]) expect(model.deleteMany).toHaveBeenCalledWith({ where: { customerId: 7 } });
    expect(db.customer.update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({ phone: null, email: null, oneCId: null, shopType: null, shopLink: null, referralSource: null, orderedBefore: null, manager: null, pushPromo: false, isApproved: false, wholesaleAccess: null, isActive: false, password: "revoked-password", passwordChangedAt: expect.any(Date) }) });
    expect(db.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { email: "customer@example.test" } });
    expect(io.unlink).toHaveBeenCalledTimes(1);
    expect(io.unlink).toHaveBeenCalledWith("/private-proofs/p.jpg");
    expect(r.headers.get("set-cookie")).toContain("auth_token=");
    expect(r.headers.get("set-cookie")).toContain("1970");
  });
});
