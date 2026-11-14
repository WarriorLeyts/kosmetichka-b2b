import { beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ odataGet: vi.fn(), odataAll: vi.fn(), odataCreate: vi.fn(), odataPatch: vi.fn() }));
vi.mock("../scripts/onec-odata.js", () => io);
import { findCounterparty, findCardCounterparty, clearCounterpartyPhoneCache, findPhoneCounterparty } from "../scripts/onec-orders.js";
const OWNER = "11111111-1111-1111-1111-111111111111";
const SECOND = "22222222-2222-2222-2222-222222222222";
beforeEach(() => { vi.clearAllMocks(); clearCounterpartyPhoneCache(); io.odataAll.mockResolvedValue([]); });
describe("1С counterparty selected by linked card", () => {
  it("resolves the active card's owner without relying on the account phone", async () => {
    io.odataGet.mockImplementation(async (entity: string, p: { $filter?: string }) => {
      if (entity === "Catalog_ДисконтныеКарты") return [{ ВладелецКарты_Key: OWNER, DeletionMark: false }];
      if (p.$filter?.includes("Ref_Key")) return [{ Ref_Key: OWNER, DeletionMark: false, IsFolder: false }];
      return [];
    });
    expect(await findCounterparty(null, "89990000000", process.env, "900123")).toBe(OWNER);
    expect(io.odataGet.mock.calls.some(([, p]) => p.$filter?.includes("НомерТелефонаДляПоиска"))).toBe(false);
    expect(io.odataCreate).not.toHaveBeenCalled();
  });
  it("does not choose between two active owners of the same card number", async () => {
    io.odataGet.mockImplementation(async (entity: string) => entity === "Catalog_ДисконтныеКарты"
      ? [OWNER, SECOND].map((id) => ({ ВладелецКарты_Key: id, DeletionMark: false }))
      : [OWNER, SECOND].map((id) => ({ Ref_Key: id, DeletionMark: false, IsFolder: false })));
    expect(await findCardCounterparty("900123", process.env)).toBeNull();
  });
  it("does not use a deleted card, a deleted owner or an owner folder", async () => {
    io.odataGet.mockResolvedValueOnce([{ ВладелецКарты_Key: OWNER, DeletionMark: true }]);
    expect(await findCardCounterparty("900123", process.env)).toBeNull();
    for (const flags of [{ DeletionMark: true, IsFolder: false }, { DeletionMark: false, IsFolder: true }]) {
      io.odataGet.mockResolvedValueOnce([{ ВладелецКарты_Key: OWNER, DeletionMark: false }]).mockResolvedValueOnce([{ Ref_Key: OWNER, ...flags }]);
      expect(await findCardCounterparty("900123", process.env)).toBeNull();
    }
  });
  it("keeps a staff-assigned valid counterparty id as the first choice", async () => {
    io.odataGet.mockResolvedValue([{ Ref_Key: SECOND, DeletionMark: false }]);
    expect(await findCounterparty(SECOND, "89990000000", process.env, "900123")).toBe(SECOND);
    expect(io.odataGet).toHaveBeenCalledTimes(1);
  });
});

describe("normalised profile phone fallback", () => {
  it.each(["89286481222", "+7 (928) 648-12-22", "79286481222", "928-648-12-22"])("matches %s against a formatted number in 1С", async (phone) => {
    io.odataGet.mockResolvedValue([]);
    io.odataAll.mockResolvedValue([{ Ref_Key: OWNER, DeletionMark: false, IsFolder: false, НомерТелефонаДляПоиска: "+7 (928) 648-12-22" }]);
    expect(await findCounterparty(null, phone, process.env, "unknown-card")).toBe(OWNER);
  });
  it("does not choose one of two counterparties with equivalent formatted phones", async () => {
    io.odataAll.mockResolvedValue([OWNER, SECOND].map((Ref_Key) => ({ Ref_Key, НомерТелефонаДляПоиска: "89286481222" })));
    expect(await findPhoneCounterparty("+7 928 648-12-22", process.env)).toBeNull();
  });
  it("does not treat a 1С outage as an absent personal counterparty", async () => {
    io.odataAll.mockRejectedValue(new Error("1С unavailable"));
    await expect(findPhoneCounterparty("89286481222", process.env)).rejects.toThrow("1С unavailable");
  });
});
