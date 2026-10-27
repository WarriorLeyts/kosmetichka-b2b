import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { describeChanges, diffLines, summarizeRows } from "./orderChanges";

const line = (id: number, quantity: number, price: number, extra: object = {}) => ({ id, productId: id * 10, productName: `Товар ${id}`, quantity, price, ...extra });
const at = (min: number) => new Date(Date.UTC(2026, 9, 27, 12, min));
const stored = (r: ReturnType<typeof diffLines>[number], side: "staff" | "customer", min: number, actorName: string | null = null) => ({ ...r, side, actorName, createdAt: at(min) });

describe("diffLines", () => {
  it("finds added, removed and changed lines", () => {
    const rows = diffLines([line(1, 2, 100), line(2, 1, 50), line(3, 1, 70, { variantName: "Розовый" })], [line(1, 4, 100), line(3, 1, 70, { variantName: "Синий" }), line(4, 3, 20)]);
    expect(rows.map((r) => [r.kind, r.orderItemId])).toEqual([["changed", 1], ["removed", 2], ["changed", 3], ["added", 4]]);
    expect(rows[0]).toMatchObject({ oldQuantity: 2, newQuantity: 4, oldPrice: null });
    expect(rows[1]).toMatchObject({ oldQuantity: 1, oldPrice: 50 });
    expect(rows[2]).toMatchObject({ oldVariant: "Розовый", newVariant: "Синий", oldQuantity: null });
  });
  it("no rows when nothing changed", () => {
    expect(diffLines([line(1, 2, 100)], [line(1, 2, 100)])).toEqual([]);
  });
});

describe("describeChanges", () => {
  it("manager's and customer's changes are kept apart", () => {
    const staff = diffLines([line(1, 2, 100), line(2, 1, 50)], [line(1, 5, 90), line(2, 1, 50), line(3, 1, 30)]).map((r) => stored(r, "staff", 1, "Анна"));
    const cust = diffLines([line(1, 5, 90), line(2, 1, 50), line(3, 1, 30)], [line(1, 5, 90), line(3, 2, 30)]).map((r) => stored(r, "customer", 2));
    const out = describeChanges([...staff, ...cust], [line(1, 5, 90), line(3, 2, 30)]);
    expect(out.lines[1].staff).toMatchObject({ kind: "changed", oldQuantity: 2, oldPrice: 100, actorName: "Анна" });
    expect(out.lines[1].customer).toBeUndefined();
    expect(out.lines[3].staff).toMatchObject({ kind: "added" });
    expect(out.lines[3].customer).toMatchObject({ kind: "changed", oldQuantity: 1 });
    expect(out.removed).toEqual([expect.objectContaining({ productName: "Товар 2", side: "customer", quantity: 1, price: 50 })]);
  });

  it("a series of changes shows the first «было»; back to the start is no change", () => {
    const a = diffLines([line(1, 2, 100)], [line(1, 3, 100)]).map((r) => stored(r, "staff", 1));
    const b = diffLines([line(1, 3, 100)], [line(1, 4, 100)]).map((r) => stored(r, "staff", 2));
    expect(describeChanges([...a, ...b], [line(1, 4, 100)]).lines[1].staff).toMatchObject({ oldQuantity: 2 });
    const back = diffLines([line(1, 4, 100)], [line(1, 2, 100)]).map((r) => stored(r, "staff", 3));
    expect(describeChanges([...a, ...b, ...back], [line(1, 2, 100)]).lines[1]).toBeUndefined();
  });

  it("a line added and then changed by the same side stays «added»", () => {
    const add = diffLines([], [line(1, 1, 100)]).map((r) => stored(r, "customer", 1));
    const ch = diffLines([line(1, 1, 100)], [line(1, 3, 100)]).map((r) => stored(r, "customer", 2));
    expect(describeChanges([...add, ...ch], [line(1, 3, 100)]).lines[1].customer).toMatchObject({ kind: "added", oldQuantity: null });
  });
});

describe("summarizeRows", () => {
  it("one line per change", () => {
    const rows = diffLines([line(1, 2, 100), line(2, 1, 50)], [line(1, 4, 100), line(3, 2, 20)]);
    expect(summarizeRows(rows)).toBe("Товар 1: 2 → 4 шт.\n− Товар 2\n+ Товар 3 — 2 шт.");
  });
});
