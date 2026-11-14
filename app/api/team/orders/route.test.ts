import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const who = vi.hoisted(() => ({ role: "admin", authenticated: true }));
vi.mock("../_auth", () => ({ ADMIN_MANAGER: ["admin", "manager"], requireStaff: vi.fn(async () => who.authenticated
  ? { ok: true, session: { id: 1, role: who.role } }
  : { ok: false, response: new Response(null, { status: 401 }) }) }));
const db = vi.hoisted(() => ({ order: { count: vi.fn(async (_a?: unknown) => 0), findMany: vi.fn(async (_a?: unknown) => []), groupBy: vi.fn(async (_a?: unknown) => []) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/staffScope", () => ({ staffScope: vi.fn(async () => ({})), orderScopeWhere: vi.fn(() => ({ customer: { manager: "allowed" } })) }));
vi.mock("@/lib/customerChatMarks", () => ({ customerChatMarks: vi.fn(async () => new Map()), EMPTY_MARKS: {} }));
import { GET } from "./route";

beforeEach(() => { vi.clearAllMocks(); who.role = "admin"; who.authenticated = true; });
const request = (qs = "") => GET(new NextRequest(`https://x/api/team/orders?date=&${qs}`));

describe("admin-only order customer type", () => {
  it.each([
    ["retail", ["retail", "discount"]],
    ["wholesale", ["wholesale"]],
    ["big_wholesale", ["big_wholesale"]],
  ])("%s filters the order snapshot, with a profile fallback only for old orders", async (type, types) => {
    const r = await request(`customerType=${type}&customer=Амина&status=assembly&page=2`);
    expect(r.status).toBe(200);
    expect((await r.json()).filters.customerType).toBe(type);
    const args = db.order.findMany.mock.calls[0][0] as { where: Record<string, unknown>; skip: number };
    const typeWhere = { OR: [{ priceType: { in: types } }, { priceType: null, customer: { priceType: { in: types } } }] };
    expect(args.where).toMatchObject({ AND: [{ customer: { manager: "allowed" } }, typeWhere], status: "assembly", customer: { OR: expect.arrayContaining([{ name: { contains: "Амина", mode: "insensitive" } }]) } });
    expect(args.skip).toBe(50);
    // Both versions of summary counts and the confirmed count keep the same filter.
    for (const [group] of db.order.groupBy.mock.calls) {
      expect((group as { where: unknown }).where).toMatchObject({ AND: [{ customer: { manager: "allowed" } }, typeWhere] });
      expect((group as { where: { status?: string } }).where.status).toBeUndefined();
    }
    for (const [count] of db.order.count.mock.calls) expect((count as { where: unknown }).where).toMatchObject({ AND: [{ customer: { manager: "allowed" } }, typeWhere] });
  });
  it("all types preserves manager scope", async () => {
    who.role = "manager";
    expect((await request()).status).toBe(200);
    expect((db.order.findMany.mock.calls[0][0] as { where: unknown }).where).toMatchObject({ AND: [{ customer: { manager: "allowed" } }, {}] });
  });
  it("managers cannot use a forged filter query", async () => {
    who.role = "manager";
    expect((await request("customerType=retail")).status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
  it("rejects unknown types", async () => {
    expect((await request("customerType=anything")).status).toBe(400);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    who.authenticated = false;
    expect((await request("customerType=retail")).status).toBe(401);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
