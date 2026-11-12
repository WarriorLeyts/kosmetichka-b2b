import { describe, expect, it } from "vitest";
import { arrivalKindOf, arrivalWindows, readArrivalSettings } from "./arrivalSettings";

const now = new Date("2026-11-20T12:00:00Z").getTime();
const ago = (d: number) => new Date(now - d * 86400_000);

describe("«Новинка» / «Снова в наличии» periods from the admin panel", () => {
  it("reads the setting safely", () => {
    expect(readArrivalSettings(null)).toEqual({ newDays: 10, backDays: 10 });
    expect(readArrivalSettings({ newDays: 30, backDays: "7" })).toEqual({ newDays: 30, backDays: 7 });
    expect(readArrivalSettings({ newDays: 0, backDays: 999 })).toEqual({ newDays: 1, backDays: 60 });
    expect(readArrivalSettings({ newDays: "x" })).toEqual({ newDays: 10, backDays: 10 });
  });

  it("each label has its own period", () => {
    const w = arrivalWindows({ newDays: 30, backDays: 7 }, now);
    expect(arrivalKindOf({ docDate: ago(20), firstReceiptAt: ago(20) }, w)).toBe("new"); // first came 20 days ago, «Новинка» 30
    expect(arrivalKindOf({ docDate: ago(5), firstReceiptAt: ago(300) }, w)).toBe("back");
    expect(arrivalKindOf({ docDate: ago(10), firstReceiptAt: ago(300) }, w)).toBe(null); // «Снова в наличии» only 7
    expect(arrivalKindOf({ docDate: ago(35), firstReceiptAt: ago(35) }, w)).toBe(null);
    const w2 = arrivalWindows({ newDays: 3, backDays: 14 }, now);
    // a novelty older than its period becomes «Снова в наличии» while the back period lasts
    expect(arrivalKindOf({ docDate: ago(5), firstReceiptAt: ago(5) }, w2)).toBe("back");
    expect(w2.since).toEqual(ago(14));
  });
});
