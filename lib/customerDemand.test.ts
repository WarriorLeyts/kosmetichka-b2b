import { describe, expect, it, vi } from "vitest";
import { demandId, demandName, demandQuantity, demandSameOrigin } from "./customerDemand";
import { recordRestock } from "../scripts/record-restock.js";
describe("customer wishes are demand, never an order or a reservation", () => {
  it.each([true, false, "15", 0, -1, 1.5, 10001, null, NaN])("rejects invalid quantity %s", n => expect(demandQuantity(n)).toBeNull());
  it("bounds numbers and normalizes names for per-customer deduplication", () => {
    expect(demandQuantity(15)).toBe(15); expect(demandQuantity(10000)).toBe(10000);
    expect(demandName("  Dr.   ALTHEA  ")).toEqual({ name: "Dr. ALTHEA", key: "dr. althea" });
    expect(demandName(" ")).toBeNull(); expect(demandId(true)).toBeNull(); expect(demandId("../1")).toBeNull();
  });
  it("accepts native and same-host browser writes behind a reverse proxy, rejects other origins", () => {
    expect(demandSameOrigin(new Request("https://site/api"))).toBe(true);
    expect(demandSameOrigin(new Request("http://localhost/api", { headers: { host: "site", origin: "https://site" } }))).toBe(true);
    expect(demandSameOrigin(new Request("https://site/api", { headers: { origin: "https://other" } }))).toBe(false);
  });
  it("claims one notification and timestamp atomically, never announces a duplicate", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const create = vi.fn().mockResolvedValue({});
    const tx = { wishlistItem: { updateMany }, notification: { create } };
    const p = { $transaction: vi.fn(fn => fn(tx)) };
    const item = { id: 5, quantity: 15, customer: { id: 7 }, product: { id: 42, name: "Cream" } }, now = new Date("2026-11-26T10:00:00Z");
    expect(await recordRestock(p, item, now)).toBe(true);
    expect(await recordRestock(p, item, now)).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 5, customerId: 7, notified: false }, data: { notified: true, notifiedAt: now } });
    expect(create.mock.calls[0][0].data.body).toContain("15 шт.");
    expect(create.mock.calls[0][0].data.body).toContain("товар не резервируется");
  });
});
