import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelOrder, MaxmaError, reverseProcessedOrder } from "./maxma";
const client = { card: "2000123" };
const at = new Date("2026-11-14T13:00:00Z");
let balance = 475;
let returned = false;
let applications = 0;
let loseReply = false;
let failReturn = false;
let status = "STATUS_CONFIRMED";
const bodies: { method: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  balance = 475; returned = false; applications = 0; loseReply = false; failReturn = false; status = "STATUS_CONFIRMED"; bodies.length = 0;
  vi.stubEnv("MAXMA_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split("/").pop()!;
    const body = JSON.parse(String(init.body)); bodies.push({ method, body });
    if (method === "cancel-order") return Response.json({ error: { code: 32, description: "Заказ уже обработан" } });
    if (method === "get-purchase-history") return Response.json({ history: [{ orderId: "site-252", orderStatus: status, txid: "site-252", shop: { code: "online", name: "Интернет-магазин" }, rows: [{ sku: "original-guid", qty: 1 }, { sku: "original-guid", qty: 2 }] }], pagination: { total: 1 } });
    if (method === "get-bonus-history") return Response.json({ history: returned ? [{ OPERATION_REFUNDED: { returnId: "site-252-refusal" } }] : [], pagination: { total: returned ? 1 : 0 } });
    if (method === "apply-return") {
      if (failReturn) throw new Error("network unavailable");
      applications++; returned = true; balance += 630 - 105;
      if (loseReply) throw new Error("lost response after successful return");
      return Response.json({ confirmation: { refundId: "site-252-refusal", recoveredBonuses: 630, cancelledBonuses: 105 } });
    }
    throw new Error(`Unexpected MAXMA operation ${method}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("confirmed order reversal", () => {
  it("preserves MAXMA error 32 so a confirmed order takes the return path", async () => {
    await expect(cancelOrder(252)).rejects.toMatchObject({ apiCode: 32 });
  });
  it("returns spent bonuses and removes earned bonuses using the original purchase rows", async () => {
    await reverseProcessedOrder(252, client, at);
    expect(balance).toBe(1000);
    expect(bodies.find(x => x.method === "apply-return")?.body).toEqual({ transaction: { id: "site-252-refusal", executedAt: at.toISOString(), purchaseId: "site-252", shopCode: "online", shopName: "Интернет-магазин", items: [{ sku: "original-guid", itemCount: 3 }] } });
    expect(bodies.some(x => x.method === "adjust-balance")).toBe(false);
  });
  it("never refunds twice, including after the response was lost", async () => {
    loseReply = true;
    await reverseProcessedOrder(252, client, at);
    await reverseProcessedOrder(252, client, at);
    expect(applications).toBe(1);
    expect(balance).toBe(1000);
  });
  it("recognises an already cancelled reservation without making a purchase return", async () => {
    status = "STATUS_CANCELLED";
    await reverseProcessedOrder(252, client, at);
    expect(applications).toBe(0);
    expect(balance).toBe(475);
  });
  it("does not treat an unverified/unknown purchase or network error as a completed refund", async () => {
    status = "STATUS_NEW";
    await expect(reverseProcessedOrder(252, client, at)).rejects.toBeInstanceOf(MaxmaError);
    status = "STATUS_CONFIRMED"; failReturn = true;
    await expect(reverseProcessedOrder(252, client, at)).rejects.toBeInstanceOf(MaxmaError);
    expect(balance).toBe(475);
  });
});
