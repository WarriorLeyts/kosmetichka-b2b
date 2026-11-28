import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), hidden: vi.fn(), invalidate: vi.fn(), meta: vi.fn(),
  db: {
    brand: { findMany: vi.fn(), findUnique: vi.fn() }, product: { count: vi.fn(), groupBy: vi.fn() },
    cmsSetting: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }, adminAuditLog: { create: vi.fn() }, $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({ requireAdminRole: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/brandVisibility", async importOriginal => ({ ...await importOriginal<object>(), hiddenBrandIds: mocks.hidden, invalidateBrandVisibility: mocks.invalidate }));
vi.mock("@/lib/catalogMetaCache", () => ({ invalidateCatalogMeta: mocks.meta }));
import { GET, PUT } from "./route";
const request = (data: unknown) => new Request("https://example.com/api/team/brand-visibility", { method: "PUT", body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: 7, role: "admin", email: "admin" });
  mocks.hidden.mockResolvedValue(["angiopharm"]);
  mocks.db.$transaction.mockImplementation((fn: (db: typeof mocks.db) => unknown) => fn(mocks.db));
});
it("rejects manager/unauthenticated reads and writes before touching product settings", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET()).status).toBe(403);
  expect((await PUT(request({ id: "angiopharm", hidden: true }))).status).toBe(403);
  expect(mocks.db.$transaction).not.toHaveBeenCalled();
});
it("groups every Angiopharm brand under one switch and includes name-only matches in its count", async () => {
  mocks.db.brand.findMany.mockResolvedValue([{ guid: "a", name: "Angiopharm" }, { guid: "b", name: "АНГИОФАРМ" }, { guid: "c", name: "CELIMAX" }]);
  mocks.db.product.groupBy.mockResolvedValue([{ brandGuid: "a", _count: { _all: 2 } }, { brandGuid: "c", _count: { _all: 4 } }]);
  mocks.db.product.count.mockResolvedValue(5);
  const body = await (await GET()).json();
  expect(body.brands).toEqual([{ id: "angiopharm", name: "Ангиофарм (Angiopharm)", count: 5, hidden: true }, { id: "c", name: "CELIMAX", count: 4, hidden: false }]);
});
it("hides a brand persistently, audits it, and invalidates both caches", async () => {
  mocks.db.brand.findUnique.mockResolvedValue({ guid: "c", name: "CELIMAX" });
  mocks.db.cmsSetting.findUnique.mockResolvedValue(null);
  expect((await PUT(request({ id: "c", hidden: true }))).status).toBe(200);
  expect(mocks.db.cmsSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "catalog:hidden-brand:c" } }));
  expect(mocks.db.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 7, before: { hidden: false }, after: { hidden: true } }) }));
  expect(mocks.invalidate).toHaveBeenCalled(); expect(mocks.meta).toHaveBeenCalled();
});
it("restores only the brand rule and leaves manual per-product hiding untouched", async () => {
  mocks.db.cmsSetting.findUnique.mockResolvedValue({ key: "catalog:hidden-brand:angiopharm" });
  expect((await PUT(request({ id: "angiopharm", hidden: false }))).status).toBe(200);
  expect(mocks.db.cmsSetting.deleteMany).toHaveBeenCalledWith({ where: { key: "catalog:hidden-brand:angiopharm" } });
  expect(mocks.db.cmsSetting.upsert).not.toHaveBeenCalled();
});
it("validates the chosen brand and action", async () => {
  expect((await PUT(request({ id: "x", hidden: "yes" }))).status).toBe(400);
  mocks.db.brand.findUnique.mockResolvedValue(null);
  expect((await PUT(request({ id: "x", hidden: true }))).status).toBe(404);
  expect(mocks.db.$transaction).not.toHaveBeenCalled();
});
