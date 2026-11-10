/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildOrderBody, moscowLocal, orderNumber } from "../scripts/onec-orders.js";
import { cmlComment as cmlCommentJs } from "../scripts/onec-order-comment.js";
import { cmlComment } from "./commerceml";
import { ordersViaOData } from "./onecOrders";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("site orders → «Заказ покупателя» in 1С over OData", () => {
  it("is on only with ORDERS_TO_1C=odata and OData configured", () => {
    const odata = { ODATA_BASE_URL: "http://x", ODATA_USER: "u", ODATA_PASSWORD: "p" };
    expect(ordersViaOData(env({ ...odata, ORDERS_TO_1C: "odata" }))).toBe(true);
    expect(ordersViaOData(env(odata))).toBe(false);
    expect(ordersViaOData(env({ ORDERS_TO_1C: "odata" }))).toBe(false);
  });

  it("number and date as the 1С integration had them", () => {
    expect(orderNumber(209)).toBe("СА-000209");
    expect(orderNumber(1234567)).toBe("СА-1234567");
    expect(moscowLocal(new Date("2026-11-08T12:14:11Z"))).toBe("2026-11-08T15:14:11");
  });

  it("builds the document: template fields, lines with discounts, total", () => {
    const template = {
      Организация_Key: "org", СтруктурнаяЕдиницаРезерв_Key: "store", НалогообложениеНДС: "НеОблагаетсяНДС", Ответственный_Key: "someone",
      Запасы: [{ СтавкаНДС_Key: "vat0", ЕдиницаИзмерения: "pcs" }],
    };
    const body: Record<string, any> = buildOrderBody(
      {
        id: 209,
        createdAt: new Date("2026-11-08T12:14:11Z"),
        comment: "Позвонить",
        items: [
          { guid: "g1", quantity: 2, price: 100, total: 200, discount: 20, bonusDiscount: 0 },
          { guid: "g2", quantity: 1, price: 50, total: 50, discount: 0, bonusDiscount: 0 },
        ],
      },
      { template, counterpartyRef: "cp", contractRef: "ct", units: new Map([["g2", "box"]]), customerName: " Милана ", phone: "89280000000", at: new Date("2026-11-10T10:45:00Z") }
    );
    expect(body.Number).toBe("СА-000209");
    // the upload moment, not the order's createdAt
    expect(body.Date).toBe("2026-11-10T13:45:00");
    expect(body.ВидОперации).toBe("ЗаказНаПродажу");
    expect(body.Организация_Key).toBe("org");
    expect(body).not.toHaveProperty("Ответственный_Key"); // only the listed service fields are copied
    expect(body.Контрагент_Key).toBe("cp");
    expect(body.Договор_Key).toBe("ct");
    expect(body.КонтактноеЛицо).toBe("Милана");
    expect(body.ИнформацияПоКонтрагенту.map((x: { Представление: string }) => x.Представление)).toEqual(["Милана", "Милана", "Физ. лицо", "89280000000"]);
    expect(body.Запасы[0]).toMatchObject({ Номенклатура: "g1", Количество: 2, Цена: 100, СуммаСкидкиНаценки: 20, ПроцентСкидкиНаценки: 10, Сумма: 180, Всего: 180, СтавкаНДС_Key: "vat0", ЕдиницаИзмерения: "pcs", СтруктурнаяЕдиницаРезерв_Key: "store" });
    expect(body.Запасы[1]).toMatchObject({ Номенклатура: "g2", ЕдиницаИзмерения: "box", Сумма: 50, СуммаСкидкиНаценки: 0 });
    expect(body.СуммаДокумента).toBe(230);
  });

  it("the comment is the same as in the XML export", () => {
    for (const o of [{ comment: "Позвонить" }, { comment: null, promoCode: "A1", discount: 50 }, { comment: "x", bonusesApplied: 30 }, { comment: "y", promoCode: "B", discount: 5, bonusesApplied: 7 }]) {
      expect(cmlCommentJs(o)).toBe(cmlComment(o));
    }
  });
});
