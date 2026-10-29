import { describe, expect, it } from "vitest";
import { registrationPriceType } from "./oneCPriceType";

describe("registrationPriceType", () => {
  it("1C «Крупный опт» is never taken", () => {
    expect(registrationPriceType("wholesale", "big_wholesale")).toBe("wholesale");
    expect(registrationPriceType("retail", "big_wholesale")).toBe("retail");
  });
  it("1C «Опт» is taken", () => {
    expect(registrationPriceType("wholesale", "wholesale")).toBe("wholesale");
    expect(registrationPriceType("retail", "wholesale")).toBe("wholesale");
  });
  it("«Крупный опт» chosen at registration → «Опт» (the manager sets big wholesale)", () => {
    expect(registrationPriceType("big_wholesale", "big_wholesale")).toBe("wholesale");
    expect(registrationPriceType("big_wholesale", null)).toBe("wholesale");
  });
});
