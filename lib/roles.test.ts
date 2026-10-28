import { describe, expect, it } from "vitest";
import { accessOf, maxAccess, roleOptions, switchDecision } from "./roles";

describe("price type switching", () => {
  it("wholesale customer switches to retail and back", () => {
    expect(switchDecision({ priceType: "wholesale" }, "retail")).toBe("switch");
    expect(switchDecision({ priceType: "retail", wholesaleAccess: "wholesale" }, "wholesale")).toBe("switch");
  });

  it("wholesale customer needs a request for big wholesale", () => {
    expect(switchDecision({ priceType: "wholesale", wholesaleAccess: "wholesale" }, "big_wholesale")).toBe("request");
  });

  it("big wholesale customer may pick any level", () => {
    const c = { priceType: "retail", wholesaleAccess: "big_wholesale" };
    expect(switchDecision(c, "wholesale")).toBe("switch");
    expect(switchDecision(c, "big_wholesale")).toBe("switch");
  });

  it("retail customer without access sends a request", () => {
    expect(switchDecision({ priceType: "retail" }, "wholesale")).toBe("request");
    expect(switchDecision({ priceType: "retail" }, "retail")).toBe("same");
    expect(switchDecision({ priceType: "discount" }, "retail")).toBe("forbidden");
  });

  it("existing wholesale price type counts as granted access", () => {
    expect(accessOf({ priceType: "big_wholesale", wholesaleAccess: null })).toBe("big_wholesale");
    expect(accessOf({ priceType: "wholesale", wholesaleAccess: "big_wholesale" })).toBe("big_wholesale");
    expect(maxAccess("wholesale", "retail")).toBe("wholesale");
  });

  it("options show pending request", () => {
    const o = roleOptions({ priceType: "retail", roleRequest: "wholesale", roleRequestStatus: "pending" });
    expect(o.map((x) => [x.value, x.state])).toEqual([
      ["retail", "current"],
      ["wholesale", "pending"],
      ["big_wholesale", "request"],
    ]);
    expect(roleOptions({ priceType: "discount" })[0]).toMatchObject({ value: "discount", state: "current", label: "Скидка по карте" });
  });
});
