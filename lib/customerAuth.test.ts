import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyToken = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/auth", () => ({ verifyToken: (t: string) => verifyToken(t) }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: { findUnique: (a: unknown) => findUnique(a) } } }));

import { verifyCustomerToken } from "./customerAuth";

describe("verifyCustomerToken", () => {
  beforeEach(() => {
    verifyToken.mockReset();
    findUnique.mockReset().mockResolvedValue({ isActive: true });
  });

  it("принимает токен покупателя", async () => {
    verifyToken.mockResolvedValue({ id: 7, email: "a@b.ru", role: "customer" });
    expect(await verifyCustomerToken("t")).toMatchObject({ id: 7 });
  });

  it.each(["employee", "hr", "picker", "manager", "admin", undefined])(
    "не принимает токен сотрудника с ролью %s (id из таблицы User)",
    async (role) => {
      verifyToken.mockResolvedValue({ id: 7, email: "anna", role });
      expect(await verifyCustomerToken("t")).toBeNull();
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it("не принимает заблокированного покупателя", async () => {
    verifyToken.mockResolvedValue({ id: 7, role: "customer" });
    findUnique.mockResolvedValue({ isActive: false });
    expect(await verifyCustomerToken("t")).toBeNull();
  });

  it("вход, сделанный до смены пароля, больше не действует", async () => {
    const changed = new Date("2026-10-31T09:00:00Z");
    findUnique.mockResolvedValue({ isActive: true, passwordChangedAt: changed });
    verifyToken.mockResolvedValue({ id: 7, role: "customer", iat: changed.getTime() / 1000 - 60 });
    expect(await verifyCustomerToken("t")).toBeNull();
    verifyToken.mockResolvedValue({ id: 7, role: "customer", iat: changed.getTime() / 1000 });
    expect(await verifyCustomerToken("t")).toMatchObject({ id: 7 });
  });
});
