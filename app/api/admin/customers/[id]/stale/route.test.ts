/** «Неактуальные»: a sign-up or a wholesale request set aside, and back. Admin only. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ id: 1 })), requireAdminRole: vi.fn(async () => auth.admin) }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn(), update: vi.fn(async (_a: { data: Record<string, unknown> }) => ({})) } }));
const updated = () => (db.customer.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "./route";

const call = (stale: boolean) =>
  POST(new Request("https://x/api/admin/customers/5/stale", { method: "POST", body: JSON.stringify({ stale }) }), { params: Promise.resolve({ id: "5" }) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.admin = true;
});

describe("stale", () => {
  it("sets aside a sign-up waiting for approval", async () => {
    db.customer.findUnique.mockResolvedValue({ isApproved: false, requestStaleAt: null, roleRequestStatus: null });
    expect((await call(true)).status).toBe(200);
    expect(updated().requestStaleAt).toBeInstanceOf(Date);
  });

  it("sets aside a wholesale request of an approved customer", async () => {
    db.customer.findUnique.mockResolvedValue({ isApproved: true, requestStaleAt: null, roleRequestStatus: "pending" });
    expect((await call(true)).status).toBe(200);
    expect(updated()).toEqual({ roleRequestStatus: "stale" });
  });

  it("brings both back", async () => {
    db.customer.findUnique.mockResolvedValue({ isApproved: false, requestStaleAt: new Date(), roleRequestStatus: "stale" });
    expect((await call(false)).status).toBe(200);
    expect(updated()).toEqual({ requestStaleAt: null, roleRequestStatus: "pending" });
  });

  it("409 without a request", async () => {
    db.customer.findUnique.mockResolvedValue({ isApproved: true, requestStaleAt: null, roleRequestStatus: null });
    expect((await call(true)).status).toBe(409);
    expect(db.customer.update).not.toHaveBeenCalled();
  });

  it("managers can't", async () => {
    auth.admin = false;
    expect((await call(true)).status).toBe(403);
  });
});
