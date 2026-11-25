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

it("offers a separate no-contact section while preserving the manager's scope", async () => {
  who.role = "manager";
  const response = await request("status=no_contact");
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.counts.byStatus).toContainEqual({ status: "no_contact", label: "Нет связи", count: 0, sum: 0 });
  expect((db.order.findMany.mock.calls[0][0] as { where: unknown }).where).toMatchObject({ status: "no_contact", AND: [{ customer: { manager: "allowed" } }, {}] });
});

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

describe("order date intervals", () => {
  it("filters orders, summary totals and confirmed counts by the same inclusive business-day period", async () => {
    const r = await request("dateFrom=2026-11-01&dateTo=2026-11-18&status=assembly&customer=Амина&customerType=wholesale");
    expect(r.status).toBe(200);
    expect((await r.json()).filters).toMatchObject({ date: "", dateFrom: "2026-11-01", dateTo: "2026-11-18" });
    const createdAt = { gte: new Date("2026-10-31T16:00:00Z"), lt: new Date("2026-11-18T16:00:00Z") };
    const args = db.order.findMany.mock.calls[0][0] as { where: unknown };
    expect(args.where).toMatchObject({ createdAt, status: "assembly", AND: [{ customer: { manager: "allowed" } }, expect.any(Object)] });
    for (const [count] of db.order.count.mock.calls) expect((count as { where: unknown }).where).toMatchObject({ createdAt });
    // Current-scope tiles (second group query) use the interval but ignore the selected status.
    const summary = db.order.groupBy.mock.calls[1][0] as { where: { createdAt: unknown; status?: string } };
    expect(summary.where.createdAt).toEqual(createdAt);
    expect(summary.where.status).toBeUndefined();
  });
  it("allows managers to select a period while preserving their customer group restriction", async () => {
    who.role = "manager";
    expect((await request("dateFrom=2026-11-01&dateTo=2026-11-18")).status).toBe(200);
    expect((db.order.findMany.mock.calls[0][0] as { where: unknown }).where).toMatchObject({ AND: [{ customer: { manager: "allowed" } }, {}] });
  });
  it.each(["dateFrom=2026-11-18", "dateFrom=2026-11-18&dateTo=2026-11-01", "dateFrom=2026-02-30&dateTo=2026-03-01", "date=2026-11-31"])("rejects invalid date selection: %s", async (query) => {
    const response = await GET(new NextRequest(`https://x/api/team/orders?${query}`));
    expect(response.status).toBe(400);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
