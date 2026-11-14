import { beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ odataGet: vi.fn(), odataCreate: vi.fn(), odataPatch: vi.fn() }));
vi.mock("../scripts/onec-odata.js", () => io);
import { findCounterparty, findCardCounterparty } from "../scripts/onec-orders.js";
const OWNER = "11111111-1111-1111-1111-111111111111";
const SECOND = "22222222-2222-2222-2222-222222222222";
beforeEach(() => { vi.clearAllMocks(); });
describe("1С counterparty selected by linked card", () => {
  it("resolves the active card's owner without relying on the account phone", async () => {
    io.odataGet.mockImplementation(async (entity: string, p: { $filter?: string }) => {
      if (entity === "Catalog_ДисконтныеКарты") return [{ ВладелецКарты_Key: OWNER, DeletionMark: false }];
      if (p.$filter?.includes("Ref_Key")) return [{ Ref_Key: OWNER, DeletionMark: false, IsFolder: false }];
      return [];
    });
    expect(await findCounterparty(null, "89990000000", {}, "900123")).toBe(OWNER);
    expect(io.odataGet.mock.calls.some(([, p]) => p.$filter?.includes("НомерТелефонаДляПоиска"))).toBe(false);
    expect(io.odataCreate).not.toHaveBeenCalled();
  });
  it("does not choose between two active owners of the same card number", async () => {
    io.odataGet.mockImplementation(async (entity: string) => entity === "Catalog_ДисконтныеКарты"
      ? [OWNER, SECOND].map((id) => ({ ВладелецКарты_Key: id, DeletionMark: false }))
      : [OWNER, SECOND].map((id) => ({ Ref_Key: id, DeletionMark: false, IsFolder: false })));
    await expect(findCardCounterparty("900123", {})).rejects.toThrow("нескольким контрагентам");
  });
  it("does not use a deleted card, a deleted owner or an owner folder", async () => {
    io.odataGet.mockResolvedValueOnce([{ ВладелецКарты_Key: OWNER, DeletionMark: true }]);
    expect(await findCardCounterparty("900123", {})).toBeNull();
    for (const flags of [{ DeletionMark: true, IsFolder: false }, { DeletionMark: false, IsFolder: true }]) {
      io.odataGet.mockResolvedValueOnce([{ ВладелецКарты_Key: OWNER, DeletionMark: false }]).mockResolvedValueOnce([{ Ref_Key: OWNER, ...flags }]);
      expect(await findCardCounterparty("900123", {})).toBeNull();
    }
  });
  it("keeps a staff-assigned valid counterparty id as the first choice", async () => {
    io.odataGet.mockResolvedValue([{ Ref_Key: SECOND, DeletionMark: false }]);
    expect(await findCounterparty(SECOND, "89990000000", {}, "900123")).toBe(SECOND);
    expect(io.odataGet).toHaveBeenCalledTimes(1);
  });
});
