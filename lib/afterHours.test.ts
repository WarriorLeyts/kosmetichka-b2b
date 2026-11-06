import { describe, expect, it } from "vitest";
import { isAfterHours } from "./afterHours";

// Moscow is UTC+3
const msk = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00+03:00`);

describe("after hours (Moscow)", () => {
  it("working time", () => {
    expect(isAfterHours(msk("09:00"))).toBe(false);
    expect(isAfterHours(msk("13:15"))).toBe(false);
    expect(isAfterHours(msk("18:39"))).toBe(false);
  });
  it("from 18:40 until 9:00", () => {
    expect(isAfterHours(msk("18:40"))).toBe(true);
    expect(isAfterHours(msk("23:59"))).toBe(true);
    expect(isAfterHours(msk("00:30"))).toBe(true);
    expect(isAfterHours(msk("08:59"))).toBe(true);
  });
});
