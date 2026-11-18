import { describe, expect, it } from "vitest";
import { orderBusinessRange, orderBusinessToday, parseOrderDates, validOrderDate } from "./orderDates";
describe("staff order date selection", () => {
  it("includes both business days, uses explicit Moscow boundaries and excludes the next day", () => {
    const range = orderBusinessRange("2026-11-01", "2026-11-18");
    expect(range.gte.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-11-18T16:00:00.000Z");
    expect(orderBusinessRange("2026-01-01").gte.toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-00-01", "2026-11-31", "18.11.2026"])("rejects impossible / malformed date %s", (v) => expect(validOrderDate(v)).toBe(false));
  it("accepts leap years correctly", () => {
    expect(validOrderDate("2024-02-29")).toBe(true);
    expect(validOrderDate("2026-02-29")).toBe(false);
  });
  it("preserves business today at the 18:30 Moscow cutoff regardless of server timezone", () => {
    expect(orderBusinessToday(new Date("2026-11-18T15:29:59Z"))).toBe("2026-11-18");
    expect(orderBusinessToday(new Date("2026-11-18T15:30:00Z"))).toBe("2026-11-19");
  });
  it("supports existing default/day/all-date requests", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(parseOrderDates(new URLSearchParams(), now)).toMatchObject({ date: "2026-11-18" });
    expect(parseOrderDates(new URLSearchParams("date="), now)).toMatchObject({ date: "", createdAt: undefined });
    expect(parseOrderDates(new URLSearchParams("date=2026-11-02"), now)).toMatchObject({ date: "2026-11-02", createdAt: orderBusinessRange("2026-11-02") });
  });
  it("rejects incomplete and reversed ranges", () => {
    for (const q of ["dateFrom=2026-11-02", "dateTo=2026-11-03", "dateFrom=2026-11-18&dateTo=2026-11-01"]) expect(parseOrderDates(new URLSearchParams(q))).toHaveProperty("error");
  });
});
