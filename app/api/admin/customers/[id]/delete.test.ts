import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn(), requireAdminRole: vi.fn() }));
const tx = vi.hoisted(() => ({ customer: { findUnique: vi.fn(), deleteMany: vi.fn() }, adminAuditLog: { create: vi.fn() } }));
const io = vi.hoisted(() => ({ unlink: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (f: (t: typeof tx) => unknown) => f(tx) } }));
vi.mock("@/lib/proofs", () => ({ PROOF_DIR: "/proofs" }));
vi.mock("fs/promises", () => io);
import { DELETE } from "./route";
const call = (id = "5") => DELETE(new Request("https://site/api/admin/customers/5", { method: "DELETE" }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.resetAllMocks();
  auth.requireAdmin.mockResolvedValue({ id: 1 });
  auth.requireAdminRole.mockResolvedValue({ id: 1, email: "admin" });
  tx.customer.findUnique.mockResolvedValue({ proofs: [{ file: "photo.jpg" }], _count: { orders: 0 } });
  tx.customer.deleteMany.mockResolvedValue({ count: 1 });
});
describe("admin-only customer deletion", () => {
  it("rejects unauthenticated requests", async () => {
    auth.requireAdmin.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(tx.customer.findUnique).not.toHaveBeenCalled();
  });
  it("rejects managers even when calling the API directly", async () => {
    auth.requireAdminRole.mockResolvedValue(null);
    expect((await call()).status).toBe(403);
    expect(tx.customer.findUnique).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.5", "abc"])("rejects invalid id %s", async (id) => {
    expect((await call(id)).status).toBe(400);
    expect(tx.customer.findUnique).not.toHaveBeenCalled();
  });
  it("returns 404 for an absent customer", async () => {
    tx.customer.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(tx.customer.deleteMany).not.toHaveBeenCalled();
  });
  it("keeps clients with any order, including completed/cancelled ones", async () => {
    tx.customer.findUnique.mockResolvedValue({ proofs: [], _count: { orders: 1 } });
    expect((await call()).status).toBe(409);
    expect(tx.customer.deleteMany).not.toHaveBeenCalled();
    expect(io.unlink).not.toHaveBeenCalled();
  });
  it("deletes an empty account, journals the action and cleans its proof files", async () => {
    expect((await call()).status).toBe(200);
    expect(tx.customer.deleteMany).toHaveBeenCalledWith({ where: { id: 5, orders: { none: {} } } });
    expect(tx.adminAuditLog.create).toHaveBeenCalled();
    expect(io.unlink).toHaveBeenCalledWith("/proofs/photo.jpg");
  });
  it("refuses deletion if an order appears before the conditional delete", async () => {
    tx.customer.deleteMany.mockResolvedValue({ count: 0 });
    expect((await call()).status).toBe(409);
    expect(io.unlink).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });
  it("handles a concurrent order protected by the foreign key", async () => {
    tx.customer.deleteMany.mockRejectedValue({ code: "P2003" });
    expect((await call()).status).toBe(409);
    expect(io.unlink).not.toHaveBeenCalled();
  });
});
