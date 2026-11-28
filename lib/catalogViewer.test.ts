import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ staffRole: "manager" as string | null }));
vi.mock("@/lib/auth", () => ({ verifyToken: async () => m.staffRole ? { id: 7, role: m.staffRole } : null }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 3, role: "customer" }) }));
import { catalogViewer } from "./catalogViewer";
const cookies = { get: (_name: string) => ({ value: "token" }) };
beforeEach(() => { m.staffRole = "manager"; });
it("uses the staff session in Team when both sessions exist in the browser", async () => {
  expect(await catalogViewer(new Request("https://x", { headers: { "x-kosmetichka-client": "team" } }), cookies)).toEqual({ customer: null, staff: { id: 7, role: "manager" } });
  expect(await catalogViewer(new Request("https://x"), cookies)).toEqual({ customer: { id: 3, role: "customer" }, staff: null });
});
it("a forged Team marker or a customer token in the admin cookie never grants staff access", async () => {
  m.staffRole = "customer";
  expect((await catalogViewer(new Request("https://x", { headers: { "x-kosmetichka-client": "team" } }), cookies)).staff).toBeNull();
  expect((await catalogViewer(new Request("https://x"), { get: name => name === "admin_token" ? { value: "token" } : undefined })).staff).toBeNull();
});
