/** Customers list: the sign-up period narrows the list and the tiles (whole Moscow days). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../_auth", () => ({ ADMIN_MANAGER: ["admin", "manager"], requireStaff: vi.fn(async () => ({ ok: true })) }));
const db = vi.hoisted(() => ({ customer: { count: vi.fn(async (_a?: unknown) => 0), findMany: vi.fn(async (_a?: unknown) => []) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("team customers period", () => {
  it("from–to → createdAt within the Moscow days", async () => {
    const r = await GET(new NextRequest("https://x/api/team/customers?from=2026-11-01&to=2026-11-07"));
    expect((await r.json()).filters).toMatchObject({ from: "2026-11-01", to: "2026-11-07" });
    const where = JSON.stringify((db.customer.findMany.mock.calls[0] as [{ where: unknown }])[0].where);
    expect(where).toContain('"gte":"2026-10-31T21:00:00.000Z"');
    expect(where).toContain('"lt":"2026-11-07T21:00:00.000Z"');
    // the tiles too
    expect(JSON.stringify(db.customer.count.mock.calls[1])).toContain("2026-10-31T21:00:00.000Z");
  });
  it("bad dates are ignored", async () => {
    await GET(new NextRequest("https://x/api/team/customers?from=yesterday"));
    expect(JSON.stringify((db.customer.findMany.mock.calls[0] as [{ where: unknown }])[0].where)).not.toContain("createdAt");
  });
});
