import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "admin" }));
const db = vi.hoisted(() => ({ wishlistItem: { groupBy: vi.fn(async () => []) }, productWish: { groupBy: vi.fn(async () => []) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../_auth", () => ({ ADMIN_ONLY: ["admin"], requireStaff: vi.fn(async (roles: string[]) => roles.includes(state.role) ? { ok: true, session: { id: 1, role: state.role } } : { ok: false, response: new Response(null, { status: 403 }) }) }));
vi.mock("@/lib/notify", () => ({ sendPush: vi.fn() }));
vi.mock("@/lib/webPush", () => ({ sendWebPushToCustomers: vi.fn() }));
import { GET, POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); state.role = "admin"; });
it.each(["manager", "picker", "customer", ""])("blocks %s before any list or mutation", async role => {
  state.role = role;
  expect((await GET(new Request("https://site/api/team/demand"))).status).toBe(403);
  expect((await POST(new Request("https://site/api/team/demand", { method: "POST", body: "{}" }))).status).toBe(403);
  expect(db.wishlistItem.groupBy).not.toHaveBeenCalled(); expect(db.productWish.groupBy).not.toHaveBeenCalled();
});
it("admin sees waiting memberships separately from already notified customers", async () => {
  await GET(new Request("https://site/api/team/demand"));
  expect(db.wishlistItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { notified: false } }));
  await GET(new Request("https://site/api/team/demand?kind=notified"));
  expect(db.wishlistItem.groupBy).toHaveBeenLastCalledWith(expect.objectContaining({ where: { notified: true } }));
});
