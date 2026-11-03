import { describe, expect, it } from "vitest";
import { fromSite, pricingCustomer } from "./siteMode";

const req = (web: boolean) => new Request("https://x/api/orders", { method: "POST", headers: web ? { "X-Kosmetichka-Client": "web" } : {} });

describe("website: retail customers pay the discount price", () => {
  it("only requests from the website build", () => {
    expect(fromSite(req(true))).toBe(true);
    expect(fromSite(req(false))).toBe(false);
  });
  it("«Розница» → «Скидка по карте» on the website, unchanged in the apps", () => {
    expect(pricingCustomer({ id: 1, priceType: "retail" }, req(true))).toEqual({ id: 1, priceType: "discount" });
    expect(pricingCustomer({ id: 1, priceType: "retail" }, req(false))).toEqual({ id: 1, priceType: "retail" });
  });
  it("other price types never change", () => {
    for (const t of ["discount", "wholesale", "big_wholesale", null]) {
      expect(pricingCustomer({ priceType: t }, req(true)).priceType).toBe(t);
    }
  });
});
