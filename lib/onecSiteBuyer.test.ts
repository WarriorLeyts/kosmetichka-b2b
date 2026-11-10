import { beforeEach, describe, expect, it, vi } from "vitest";

const BUYER = "11111111-1111-1111-1111-111111111111";
const TPL = "22222222-2222-2222-2222-222222222222";
const CONTRACT = "33333333-3333-3333-3333-333333333333";
const ORG = "44444444-4444-4444-4444-444444444444";
const PROD = "55555555-5555-5555-5555-555555555555";
let buyerExists = true;

vi.mock("../scripts/onec-odata.js", () => ({
  odataCreate: vi.fn(),
  odataGet: vi.fn(async (entity: string, params: { $filter?: string } = {}) => {
    const f = params.$filter || "";
    if (entity === "Document_ЗаказПокупателя" && f.startsWith("Date gt")) return [{ Ref_Key: TPL, Number: "СА-000100", Date: "2026-11-01T10:00:00", DeletionMark: false }];
    if (entity.startsWith("Document_ЗаказПокупателя(guid")) return { Ref_Key: TPL, Организация_Key: ORG, Запасы: [{}] };
    if (entity === "Catalog_Контрагенты" && f.includes("НомерТелефонаДляПоиска")) return [];
    if (entity === "Catalog_Контрагенты" && f.includes("Description eq")) return buyerExists ? [{ Ref_Key: BUYER, DeletionMark: false, IsFolder: false }] : [];
    if (entity === "Catalog_ДоговорыКонтрагентов") return [{ Ref_Key: CONTRACT, Description: "Основной договор", ВидДоговора: "СПокупателем", Организация_Key: ORG, Недействителен: false, DeletionMark: false }];
    if (entity === "Catalog_Номенклатура") return [{ Ref_Key: PROD, ЕдиницаИзмерения_Key: PROD }];
    return [];
  }),
}));

import { prepareOrder } from "../scripts/onec-orders.js";

const order = (customer: Record<string, unknown>) => ({
  id: 300,
  createdAt: new Date("2026-11-10T09:00:00Z"),
  comment: "Позвонить",
  customer: { oneCId: null, phone: "89001112233", name: "Аминат", ...customer },
  items: [{ guid: PROD, productName: "Крем", quantity: 1, price: 100, total: 100, discount: 0, bonusDiscount: 0 }],
});

describe("not in 1С: the common «Покупатель с сайта»", () => {
  beforeEach(() => void (buyerExists = true));

  it("no card → the order goes to «Покупатель с сайта», name and phone first in the comment", async () => {
    const r = await prepareOrder(order({ loyaltyCard: null }));
    expect(r.problems).toEqual([]);
    expect(r.siteBuyer).toBe(true);
    expect(r.body.Контрагент_Key).toBe(BUYER);
    expect(r.body.Комментарий).toBe("Клиент: Аминат, 89001112233 | Позвонить");
    expect(r.body.КонтактноеЛицо).toBe("Аминат");
  });

  it("a card holder must be in 1С: the order waits", async () => {
    const r = await prepareOrder(order({ loyaltyCard: "9000000000001" }));
    expect(r.siteBuyer).toBe(false);
    expect(r.problems[0]).toMatch(/с картой не найден в 1С/);
  });

  it("no «Покупатель с сайта» in 1С → a clear problem", async () => {
    buyerExists = false;
    const r = await prepareOrder(order({ loyaltyCard: null }));
    expect(r.problems[0]).toMatch(/нет контрагента «Покупатель с сайта»/);
  });
});
