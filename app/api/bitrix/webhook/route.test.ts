import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ order: { findUnique: vi.fn(), update: vi.fn(async () => ({})) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/orderChanges", () => ({ logOrderChanges: vi.fn(), summarizeRows: vi.fn() }));
vi.mock("@/lib/maxmaOrders", () => ({ isMaxmaOrder: vi.fn(), recalcOrderLoyalty: vi.fn(), promoWarning: vi.fn(), loyaltyWarning: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyLater: vi.fn(), notifyOrderStatus: vi.fn() }));
import { POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BITRIX_WEBHOOK_SECRET", "test"); vi.stubEnv("BITRIX_WEBHOOK_URL", ""); });
afterEach(() => vi.unstubAllEnvs());
const call = () => POST(new NextRequest("https://x/api/bitrix/webhook?secret=test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: 7 }) }));
it("a delayed Bitrix event cannot resume or edit a paused order", async () => {
  db.order.findUnique.mockResolvedValue({ id: 7, status: "no_contact", items: [] });
  expect(await (await call()).json()).toEqual({ ok: true, orderId: 7, skipped: "no_contact" });
  expect(db.order.update).not.toHaveBeenCalled();
});
it("normal processing still asks an unconfirmed customer to review", async () => {
  db.order.findUnique.mockResolvedValueOnce({ id: 7, status: "assembly", items: [] }).mockResolvedValueOnce({ confirmRequestedAt: null, customerConfirmed: false });
  expect(await (await call()).json()).toMatchObject({ ok: true, status: "consultation" });
  expect(db.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "consultation", customerConfirmed: false }) }));
});
