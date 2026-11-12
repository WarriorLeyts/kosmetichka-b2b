import { describe, expect, it } from "vitest";
import { arrivalRows, firstReceipts, fromOneC } from "../scripts/onec-arrivals.js";

const A = "3a1161f9-e0c8-11ec-b2f1-902b34d785f8";
const B = "19dfad0d-d76a-11ed-af9d-001a7dda7113";

describe("«Новые поступления» from 1С documents", () => {
  it("1С time is Moscow time", () => {
    expect(fromOneC("2026-11-02T14:59:41").toISOString()).toBe("2026-11-02T11:59:41.000Z");
  });

  it("first receipt ever: posted documents only, any warehouse", () => {
    const heads = [
      { Ref_Key: "r1", Date: "2026-03-01T10:00:00", Posted: true, DeletionMark: false },
      { Ref_Key: "r2", Date: "2026-11-05T10:00:00", Posted: true, DeletionMark: false },
      { Ref_Key: "r0", Date: "2026-01-01T10:00:00", Posted: false, DeletionMark: false },
    ];
    const lines = [
      { Ref_Key: "r2", Номенклатура_Key: A },
      { Ref_Key: "r1", Номенклатура_Key: A },
      { Ref_Key: "r2", Номенклатура_Key: B },
      { Ref_Key: "r0", Номенклатура_Key: B },
    ];
    const f = firstReceipts(heads, lines);
    expect(f.get(A)).toBe("2026-03-01T10:00:00");
    expect(f.get(B)).toBe("2026-11-05T10:00:00"); // the unposted one doesn't count
  });

  it("one row per document and product, quantities summed, empty lines dropped", () => {
    const docs = [{ Ref_Key: "t1", Number: " КСНФ-1 ", Date: "2026-11-10T09:00:00" }];
    const lines = [
      { Ref_Key: "t1", Номенклатура_Key: A, Количество: 2 },
      { Ref_Key: "t1", Номенклатура_Key: A, Количество: 3 },
      { Ref_Key: "t1", Номенклатура_Key: B, Количество: 0 },
      { Ref_Key: "x", Номенклатура_Key: B, Количество: 9 },
    ];
    const rows = arrivalRows(docs, lines, "shop", new Map([[A, "2026-11-10T09:00:00"]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productGuid: A, place: "shop", docNumber: "КСНФ-1", qty: 5 });
    expect(rows[0].firstReceiptAt?.toISOString()).toBe("2026-11-10T06:00:00.000Z");
  });
});
