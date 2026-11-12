import { describe, expect, it } from "vitest";
import { promoActive, promoSchema, readPromo } from "./promoSchema";

const p = { enabled: true, startsAt: "2026-11-13T00:00:00+03:00", endsAt: "2026-12-01T00:00:00+03:00" };

describe("promotion look by its dates", () => {
  it("runs from 13.11 00:00 to 30.11 23:59:59 Moscow", () => {
    expect(promoActive(p, Date.parse("2026-11-12T23:59:59+03:00"))).toBe(false);
    expect(promoActive(p, Date.parse("2026-11-13T00:00:00+03:00"))).toBe(true);
    expect(promoActive(p, Date.parse("2026-11-30T23:59:59+03:00"))).toBe(true);
    expect(promoActive(p, Date.parse("2026-12-01T00:00:00+03:00"))).toBe(false);
  });
  it("off when switched off, open dates allowed", () => {
    expect(promoActive({ ...p, enabled: false }, Date.parse("2026-11-20T12:00:00+03:00"))).toBe(false);
    expect(promoActive({ enabled: true, startsAt: null, endsAt: null })).toBe(true);
  });
  it("checks the input", () => {
    expect(readPromo(null).enabled).toBe(false);
    expect(promoSchema.safeParse({ startsAt: p.endsAt, endsAt: p.startsAt }).success).toBe(false);
    expect(promoSchema.safeParse({ strip: { link: "javascript:alert(1)" } }).success).toBe(false);
    expect(promoSchema.safeParse({ strip: { link: "/catalog?quick=sale" } }).success).toBe(true);
    expect(promoSchema.safeParse({ accent: "red" }).success).toBe(false);
  });
});
