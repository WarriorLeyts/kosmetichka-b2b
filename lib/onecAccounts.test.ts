import { describe, expect, it, vi } from "vitest";

const CP = "11111111-1111-1111-1111-111111111111";
const Z = "00000000-0000-0000-0000-000000000000";
const patch = vi.fn(async () => ({}));
let current: Record<string, string> = {};

vi.mock("../scripts/onec-odata.js", () => ({
  odataCreate: vi.fn(),
  odataPatch: (...a: unknown[]) => (patch as (...x: unknown[]) => unknown)(...a),
  odataGet: vi.fn(async (entity: string) => {
    if (entity === "Catalog_Контрагенты") return [current];
    if (entity === "ChartOfAccounts_Управленческий")
      return [
        { Ref_Key: "a6201", Code: "62.01", DeletionMark: false },
        { Ref_Key: "a6202", Code: "62.02", DeletionMark: false },
        { Ref_Key: "a6001", Code: "60.01", DeletionMark: false },
        { Ref_Key: "a6002", Code: "60.02", DeletionMark: false },
      ];
    return [];
  }),
}));

import { ensureCounterpartyAccounts } from "../scripts/onec-orders.js";

describe("counterparty settlement accounts — filled when an order goes to 1С", () => {
  it("empty ones get 62.01 / 62.02 / 60.01 / 60.02", async () => {
    patch.mockClear();
    current = { СчетУчетаРасчетовСПокупателем_Key: Z, СчетУчетаАвансовПокупателя_Key: Z, СчетУчетаРасчетовСПоставщиком_Key: Z, СчетУчетаАвансовПоставщику_Key: Z };
    expect((await ensureCounterpartyAccounts(CP)).length).toBe(4);
    expect(patch).toHaveBeenCalledWith("Catalog_Контрагенты", CP, { СчетУчетаРасчетовСПокупателем_Key: "a6201", СчетУчетаАвансовПокупателя_Key: "a6202", СчетУчетаРасчетовСПоставщиком_Key: "a6001", СчетУчетаАвансовПоставщику_Key: "a6002" }, expect.anything());
  });
  it("filled ones are never touched", async () => {
    patch.mockClear();
    current = { СчетУчетаРасчетовСПокупателем_Key: "x", СчетУчетаАвансовПокупателя_Key: Z, СчетУчетаРасчетовСПоставщиком_Key: "y", СчетУчетаАвансовПоставщику_Key: "z" };
    expect(await ensureCounterpartyAccounts(CP)).toEqual(["СчетУчетаАвансовПокупателя_Key"]);
    expect(patch).toHaveBeenCalledWith("Catalog_Контрагенты", CP, { СчетУчетаАвансовПокупателя_Key: "a6202" }, expect.anything());
  });
  it("all filled → nothing written", async () => {
    patch.mockClear();
    current = { СчетУчетаРасчетовСПокупателем_Key: "x", СчетУчетаАвансовПокупателя_Key: "x", СчетУчетаРасчетовСПоставщиком_Key: "x", СчетУчетаАвансовПоставщику_Key: "x" };
    expect(await ensureCounterpartyAccounts(CP)).toEqual([]);
    expect(patch).not.toHaveBeenCalled();
  });
});
