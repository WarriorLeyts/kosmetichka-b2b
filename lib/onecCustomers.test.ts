import { describe, expect, it } from "vitest";
import { counterpartyBody, phone8 } from "../scripts/onec-counterparty.js";
import { IMPORT_GROUPS } from "../scripts/onec-groups.js";
import { MANAGER_GROUPS } from "./staffScope";

describe("a customer's 1С group chosen in an order", () => {
  it("offers the 8 groups the site gets from 1С, every manager group among them", () => {
    expect(IMPORT_GROUPS).toHaveLength(8);
    for (const g of MANAGER_GROUPS) expect(IMPORT_GROUPS).toContain(g);
  });

  it("phone as 1С keeps it", () => {
    expect(phone8("+7 (928) 019-54-87")).toBe("89280195487");
    expect(phone8("9280195487")).toBe("89280195487");
    expect(phone8("89280195487")).toBe("89280195487");
    expect(phone8("123")).toBe("");
  });

  it("a new counterparty: in the folder, a buyer, phone for search and as contact info", () => {
    const b = counterpartyBody({ name: " Хеди Осмаева ", phone: "89332158999", parentRef: "folder", template: { СчетУчетаРасчетовСПокупателем_Key: "05652840-e0a9-11f0-ae3b-8cefff82df07", Ответственный_Key: "x" }, phoneKindRef: "kind" });
    expect(b).toMatchObject({ Description: "Хеди Осмаева 89332158999", НаименованиеПолное: "Хеди Осмаева 89332158999", Parent_Key: "folder", Покупатель: true, ВидКонтрагента: "ФизическоеЛицо", НомерТелефонаДляПоиска: "89332158999", ОсновныеСведения: "Хеди Осмаева\n89332158999" });
    expect(b.СчетУчетаРасчетовСПокупателем_Key).toBe("05652840-e0a9-11f0-ae3b-8cefff82df07");
    expect(b).not.toHaveProperty("Ответственный_Key");
    expect(b.КонтактнаяИнформация?.[0]).toMatchObject({ Тип: "Телефон", Вид_Key: "kind", Представление: "89332158999", НомерТелефона: "89332158999" });
  });
});
