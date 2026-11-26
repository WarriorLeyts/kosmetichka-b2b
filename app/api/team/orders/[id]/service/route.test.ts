import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const state = vi.hoisted(() => ({ authenticated: true, role: "admin", visible: true, kind: "started" }));
const start = vi.hoisted(() => vi.fn());
vi.mock("../../../_auth", () => ({ ADMIN_MANAGER: ["admin", "manager"], requireStaff: vi.fn(async () => !state.authenticated ? { ok: false, response: NextResponse.json({}, { status: 401 }) } : !["admin", "manager"].includes(state.role) ? { ok: false, response: NextResponse.json({}, { status: 403 }) } : { ok: true, session: { id: 5, login: "test-staff", role: state.role } }) }));
vi.mock("@/lib/staffScope", () => ({ staffSeesOrder: vi.fn(async () => state.visible) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => ({ name: "Тестовый менеджер" })) } } }));
vi.mock("@/lib/orderServiceStart", () => ({ startOrderService: start }));
import { POST } from "./route";
const call = (id = "42") => POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ userId: 999, name: "injected" }) }), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); state.authenticated = true; state.role = "admin"; state.visible = true; state.kind = "started"; start.mockImplementation(async () => ({ kind: state.kind })); });
it("rejects unsigned and non-staff callers before any claim", async () => {
  state.authenticated = false; expect((await call()).status).toBe(401); state.authenticated = true; state.role = "picker"; expect((await call()).status).toBe(403); expect(start).not.toHaveBeenCalled();
});
it("a manager cannot acknowledge another group's order", async () => {
  state.role = "manager"; state.visible = false; expect((await call()).status).toBe(404); expect(start).not.toHaveBeenCalled();
});
it.each(["bad", "0", "-1"])("rejects invalid id %s", async id => { expect((await call(id)).status).toBe(400); expect(start).not.toHaveBeenCalled(); });
it("uses the authenticated actor rather than submitted ownership", async () => {
  expect((await call()).status).toBe(200); expect(start).toHaveBeenCalledWith(42, { id: 5, name: "Тестовый менеджер", login: "test-staff" });
});
it.each(["owned", "stage", "race"])("reports the %s conflict without taking ownership", async kind => { state.kind = kind; expect((await call()).status).toBe(409); });
