import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.stubEnv("JWT_SECRET", "test-secret-for-auth-tests-0123456789");

const { createToken, verifyToken } = await import("./auth");

beforeEach(() => db.user.findUnique.mockReset());

describe("staff tokens are checked against the account", () => {
  it("existing account with the same role → valid", async () => {
    db.user.findUnique.mockResolvedValue({ role: "manager" });
    const t = await createToken({ id: 3, email: "anna", role: "manager" });
    expect((await verifyToken(t))?.id).toBe(3);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, select: { role: true } });
  });

  it("deleted employee → rejected at once", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const t = await createToken({ id: 3, email: "anna", role: "manager" });
    expect(await verifyToken(t)).toBeNull();
  });

  it("role lowered (admin → picker) → the old admin token is rejected", async () => {
    db.user.findUnique.mockResolvedValue({ role: "picker" });
    const t = await createToken({ id: 3, email: "anna", role: "admin" });
    expect(await verifyToken(t)).toBeNull();
  });

  it("customer tokens skip the staff table", async () => {
    const t = await createToken({ id: 3, email: "c@x.ru", role: "customer" });
    expect((await verifyToken(t))?.role).toBe("customer");
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("forged / broken token → null without a DB call", async () => {
    expect(await verifyToken("abc.def.ghi")).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
