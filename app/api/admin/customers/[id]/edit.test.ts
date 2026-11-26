import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ id: 1 }), requireAdminRole: async () => ({ id: 1 }) }));
vi.mock("@/lib/onecCustomers", () => ({ CUSTOMER_GROUPS: ["Бимарзаева Раяна"], odataReady: () => true }));
const io = vi.hoisted(() => ({ assignCounterparty: vi.fn(), kickOrderTo1C: vi.fn() }));
vi.mock("@/scripts/onec-counterparty.js", () => ({ assignCounterparty: io.assignCounterparty }));
vi.mock("@/lib/onecOrders", () => ({ kickOrderTo1C: io.kickOrderTo1C }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn(), update: vi.fn(async () => ({})) }, order: { findMany: vi.fn(async () => [{ id: 7 }]) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { PUT } from "./route";
const call = (body: object) => PUT(new Request("https://x/api/admin/customers/5", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "5" }) });
beforeEach(() => { vi.resetAllMocks(); db.customer.findUnique.mockResolvedValue({ id: 5, phone: "89991234567", priceType: "wholesale", manager: "Бимарзаева Раяна", oneCId: null }); io.assignCounterparty.mockResolvedValue({ ref: "11111111-1111-1111-1111-111111111111" }); db.order.findMany.mockResolvedValue([{ id: 7 }]); });
it("repairs an assigned manager with no ID and saves both fields after 1C succeeds", async () => {
 expect((await call({ manager: "Бимарзаева Раяна", oneCId: "" })).status).toBe(200);
 expect(db.customer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ manager: "Бимарзаева Раяна", oneCId: "11111111-1111-1111-1111-111111111111" }) }));
 expect(io.kickOrderTo1C).toHaveBeenCalledWith(7);
});
it("does not save any partial profile or retry orders when 1C rejects the assignment", async () => {
 io.assignCounterparty.mockRejectedValue(new Error("Several matching counterparties"));
 expect((await call({ name: "Changed", manager: "Бимарзаева Раяна" })).status).toBe(400);
 expect(db.customer.update).not.toHaveBeenCalled(); expect(io.kickOrderTo1C).not.toHaveBeenCalled();
});
it("cannot erase the ID while keeping a manager", async () => {
 db.customer.findUnique.mockResolvedValue({ id: 5, priceType: "wholesale", manager: "Бимарзаева Раяна", oneCId: "existing" });
 expect((await call({ oneCId: "" })).status).toBe(409); expect(db.customer.update).not.toHaveBeenCalled();
});
it("an ordinary edit of an already bound profile does not need 1C connectivity", async () => {
 db.customer.findUnique.mockResolvedValue({ id: 5, priceType: "wholesale", manager: "Бимарзаева Раяна", oneCId: "existing" });
 expect((await call({ address: "New address" })).status).toBe(200); expect(io.assignCounterparty).not.toHaveBeenCalled();
});
