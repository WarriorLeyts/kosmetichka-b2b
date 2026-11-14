import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ id: 1, role: "admin" }) }));
vi.mock("@/lib/staffScope", () => ({ staffScope: async () => ({ all: true }), orderScopeWhere: () => ({}) }));
vi.mock("@/lib/maxmaOrders", () => ({ onOrderStatus: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: vi.fn() }));
const db = vi.hoisted(() => ({
  order: { findMany: vi.fn(async () => [{ id: 7, status: "consultation", customerConfirmed: true, confirmRequestedAt: null }]), updateMany: vi.fn(async () => ({ count: 1 })) },
  orderItemCheck: { deleteMany: vi.fn() },
  orderStatusLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { POST } from "./route";
beforeEach(() => vi.clearAllMocks());
it("bulk return to assembly keeps checks and resets confirmation", async () => {
  const response = await POST(new NextRequest("https://x/api/admin/orders/bulk-status", { method: "POST", body: JSON.stringify({ orderIds: [7], toStatus: "assembly" }) }));
  expect(await response.json()).toEqual({ updated: [7], skipped: [] });
  expect(db.orderItemCheck.deleteMany).not.toHaveBeenCalled();
  expect(db.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "assembly", customerConfirmed: false, confirmRequestedAt: null } }));
});
