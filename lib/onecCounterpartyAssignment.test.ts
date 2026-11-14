import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ odataGet: vi.fn(), odataCreate: vi.fn(), odataPatch: vi.fn(), findCounterparty: vi.fn(), orderTemplate: vi.fn(), createContract: vi.fn() }));
vi.mock("../scripts/onec-odata.js", () => ({ odataGet: io.odataGet, odataCreate: io.odataCreate, odataPatch: io.odataPatch }));
vi.mock("../scripts/onec-orders.js", async (original) => ({ ...await original<typeof import("../scripts/onec-orders.js")>(), findCounterparty: io.findCounterparty, orderTemplate: io.orderTemplate, createContract: io.createContract }));
import { assignCounterparty, counterpartyBody } from "../scripts/onec-counterparty.js";

const OWNER = "11111111-1111-1111-1111-111111111111";
const FOLDER = "22222222-2222-2222-2222-222222222222";
const ORG = "33333333-3333-3333-3333-333333333333";
const customer = { name: " Мадина ", companyName: "Магазин косметики", phone: "+7 (963) 706-79-85", priceType: "wholesale", oneCId: null };
beforeEach(() => {
  vi.resetAllMocks();
  io.findCounterparty.mockResolvedValue(null);
  io.orderTemplate.mockResolvedValue({ Организация_Key: ORG });
  io.odataGet.mockImplementation(async (entity: string, params: { $filter?: string } = {}) => {
    if (params.$filter === "IsFolder eq true") return [{ Ref_Key: FOLDER, Description: "Раяна", DeletionMark: false }];
    if (entity === "Catalog_ДоговорыКонтрагентов") return [{ ВидДоговора: "СПокупателем", Организация_Key: ORG, DeletionMark: false }];
    if (entity.startsWith("Catalog_Контрагенты(guid")) return { Ref_Key: OWNER, Parent_Key: FOLDER };
    return [];
  });
  io.odataCreate.mockResolvedValue({ Ref_Key: OWNER });
});
describe("wholesale counterparty name and manager folder", () => {
  it("creates contact + normalised phone in the chosen manager's folder, even when company is filled", async () => {
    const result = await assignCounterparty(customer, "Раяна", process.env);
    expect(result.created).toBe(true);
    expect(io.odataCreate).toHaveBeenCalledWith("Catalog_Контрагенты", expect.objectContaining({ Description: "Мадина 89637067985", НаименованиеПолное: "Мадина 89637067985", НомерТелефонаДляПоиска: "89637067985", Parent_Key: FOLDER }), process.env);
  });
  it("keeps an existing counterparty's name and moves only its folder when needed", async () => {
    io.findCounterparty.mockResolvedValue(OWNER);
    io.odataGet.mockResolvedValueOnce([{ Ref_Key: FOLDER, Description: "Раяна", DeletionMark: false }]).mockResolvedValueOnce({ Parent_Key: ORG });
    const result = await assignCounterparty(customer, "Раяна", process.env);
    expect(result.created).toBe(false);
    expect(result.moved).toBe(true);
    expect(io.odataCreate).not.toHaveBeenCalled();
    expect(io.odataPatch).toHaveBeenCalledWith("Catalog_Контрагенты", OWNER, { Parent_Key: FOLDER }, process.env);
  });
  it("does not duplicate the phone for a customer without a name and keeps names on one line", () => {
    expect(counterpartyBody({ phone: "89637067985", parentRef: FOLDER }).Description).toBe("89637067985");
    expect(counterpartyBody({ name: " Мадина\n  Иванова ", phone: "89637067985", parentRef: FOLDER }).Description).toBe("Мадина Иванова 89637067985");
  });
});
