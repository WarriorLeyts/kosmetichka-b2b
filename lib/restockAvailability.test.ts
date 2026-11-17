import { describe, expect, it } from "vitest";
import { availableForSubscriber, becameOrderable } from "../scripts/restock-availability.js";
describe("restock subscriptions use orderable stock for each customer", () => {
  it("detects the 12 → 13 shop threshold even though retail was already in stock", () => {
    expect(becameOrderable({ stock: 12, wholesaleStock: 0 }, { stock: 13, wholesaleStock: 1 })).toBe(true);
    expect(becameOrderable({ stock: 12, wholesaleStock: 0 }, { stock: 12, wholesaleStock: 0 })).toBe(false);
  });
  it("detects warehouse-only restocks for wholesalers", () => {
    const product = { stock: 0, wholesaleStock: 20 };
    expect(becameOrderable({ stock: 0, wholesaleStock: 0 }, product)).toBe(true);
    expect(availableForSubscriber({ priceType: "wholesale" }, product)).toBe(true);
    expect(availableForSubscriber({ priceType: "big_wholesale" }, product)).toBe(true);
    expect(availableForSubscriber({ priceType: "retail" }, product)).toBe(false);
  });
  it("does not notify an opt customer when new shop stock is reserved for retail", () => {
    const product = { stock: 5, wholesaleStock: 0 };
    expect(becameOrderable({ stock: 0, wholesaleStock: 0 }, product)).toBe(true);
    expect(availableForSubscriber({ priceType: "retail" }, product)).toBe(true);
    expect(availableForSubscriber({ priceType: "wholesale" }, product)).toBe(false);
    expect(availableForSubscriber({ priceType: "big_wholesale" }, product)).toBe(false);
  });
  it("does not notify blocked or deleted accounts or unavailable goods", () => {
    expect(availableForSubscriber({ priceType: "retail", isActive: false }, { stock: 5 })).toBe(false);
    expect(availableForSubscriber({ priceType: "retail" }, { stock: null })).toBe(false);
    expect(becameOrderable({ stock: 5, wholesaleStock: 0 }, { stock: 0, wholesaleStock: 0 })).toBe(false);
  });
});
