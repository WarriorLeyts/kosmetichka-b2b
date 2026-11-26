import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: { id: 1, email: "admin-test", role: "admin" } as null | { id: number; email: string; role: string } }));
const tx = vi.hoisted(() => ({ customer: { findFirst: vi.fn(), create: vi.fn() }, adminAuditLog: { create: vi.fn() } }));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => state.admin) }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed-test-password") } }));
import bcrypt from "bcryptjs";
import { POST } from "./route";

const draft = { name: "Тестовый покупатель", phone: "+7 (999) 123-45-67", email: "Test@Example.test", password: "test-password", priceType: "retail", isApproved: true };
const call = (body: unknown = draft) => POST(new Request("https://example.test/api/admin/customers", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks(); state.admin = { id: 1, email: "admin-test", role: "admin" };
  tx.customer.findFirst.mockResolvedValue(null);
  tx.customer.create.mockImplementation(async ({ data }) => ({ id: 501, phone: data.phone, email: data.email, priceType: data.priceType, isApproved: data.isApproved }));
  tx.adminAuditLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async callback => callback(tx));
});

describe("admin customer creation", () => {
  it("rejects anonymous requests and every non-admin role before reading or writing customer data", async () => {
    for (const role of [null, "manager", "picker", "customer"]) {
      state.admin = role ? { id: 2, email: "test", role } : null;
      expect((await call()).status).toBe(role ? 403 : 401);
    }
    expect(db.$transaction).not.toHaveBeenCalled(); expect(bcrypt.hash).not.toHaveBeenCalled();
  });
  it("creates an approved customer with normalized login and hashed password, leaving phone ownership and external links unverified", async () => {
    const response = await call({ ...draft, role: "admin", oneCId: "injected", manager: "injected", phoneUnverified: false, loyaltyCard: "injected", maxmaDiscount: true });
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ success: true, customer: { id: 501, phone: "89991234567", email: "test@example.test", isApproved: true, priceType: "retail" } });
    expect(tx.customer.create).toHaveBeenCalledWith(expect.objectContaining({ data: {
      name: draft.name, phone: "89991234567", email: "test@example.test", companyName: null, address: null, password: "hashed-test-password", role: "customer", priceType: "retail", wholesaleAccess: null, isActive: true, isApproved: true, phoneUnverified: true,
    } }));
    expect(tx.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ phone: "89991234567" }, { email: { equals: "test@example.test", mode: "insensitive" } }] } }));
    expect(bcrypt.hash).toHaveBeenCalledWith(draft.password, 10);
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 1, entity: "customer", entityId: "501", action: "create" }) }));
    expect(JSON.stringify(tx.adminAuditLog.create.mock.calls)).not.toContain(draft.password);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it.each(["wholesale", "big_wholesale"])("grants only the selected %s access and supports explicitly pending accounts", async priceType => {
    expect((await call({ ...draft, email: "", priceType, isApproved: false, address: "Тестовый город, улица 1" })).status).toBe(201);
    expect(tx.customer.create.mock.calls[0][0].data).toMatchObject({ email: null, priceType, wholesaleAccess: priceType, isApproved: false, phoneUnverified: true });
  });
  it("keeps an international number as a contact without guessing an identity", async () => {
    expect((await call({ ...draft, phone: "+995 (555) 123-456" })).status).toBe(201);
    expect(tx.customer.create.mock.calls[0][0].data).toMatchObject({ phone: "+995555123456", phoneUnverified: true });
  });
  it.each(["9991234567", "8 (999) 123-45-67"])("normalizes %s to the same unique customer login", async phone => {
    expect((await call({ ...draft, phone })).status).toBe(201);
    expect(tx.customer.create.mock.calls[0][0].data.phone).toBe("89991234567");
  });
  it.each([null, [], "invalid"])("rejects a non-object body: %j", async body => {
    expect((await call(body)).status).toBe(400); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    { name: "" }, { phone: "abc9991234567" }, { phone: "899912345678" }, { email: "bad" }, { email: { not: "" } },
    { password: "123" }, { password: "я".repeat(40) }, { priceType: "admin" }, { isApproved: "false" }, { priceType: "wholesale", address: "" },
  ])("rejects invalid input before any creation: %j", async patch => {
    expect((await call({ ...draft, ...patch })).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("reports an existing or concurrently inserted login without changing that account", async () => {
    tx.customer.findFirst.mockResolvedValueOnce({ id: 9 });
    expect((await call()).status).toBe(409); expect(tx.customer.create).not.toHaveBeenCalled(); expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
    db.$transaction.mockRejectedValueOnce({ code: "P2002" }); expect((await call()).status).toBe(409);
  });
  it("rechecks duplicate email after a serialization conflict instead of creating a second account", async () => {
    db.$transaction.mockRejectedValueOnce({ code: "P2034" }); tx.customer.findFirst.mockResolvedValueOnce({ id: 9 });
    expect((await call()).status).toBe(409); expect(db.$transaction).toHaveBeenCalledTimes(2); expect(tx.customer.create).not.toHaveBeenCalled();
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });
  it("returns a retryable error after bounded database conflicts", async () => {
    db.$transaction.mockRejectedValue({ code: "P2034" });
    expect((await call()).status).toBe(503); expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
});
