import { describe, expect, it } from "vitest";
import { counterpartyPhones, phonesFromCounterparty, counterpartyPhoneIndex, normalizeCounterpartyPhone } from "../scripts/onec-phones.js";
describe("1C phone aliases", () => {
  it("recovers the current phone from the full name without truncating the malformed search phone", () => {
    const phones = phonesFromCounterparty({ НомерТелефонаДляПоиска: "892884745756, 89223589937", Description: "Зукаева Хурма 89223589937 (892884745756)", НаименованиеПолное: "Зукаева Хурма 89223589937 (89224745756) Аргун тц Беркат 13 модуль 16 маг" });
    expect(phones.sort()).toEqual(["89223589937", "89224745756"]);
    expect(normalizeCounterpartyPhone("892884745756")).toBeNull();
    expect(phones).not.toContain("89288474575");
  });
  it("accepts exact formatted numbers, deduplicates aliases and reads telephone contacts", () => {
    expect(counterpartyPhones("+7 (928) 648-12-22; 9286481222", "89286481222")).toEqual(["89286481222"]);
    expect(phonesFromCounterparty({ КонтактнаяИнформация: [{ Тип: "Телефон", Представление: "89286481222" }, { Тип: "Адрес", Представление: "89990000000" }] })).toEqual(["89286481222"]);
  });
  it("retains ambiguity and deduplicates the same counterparty across its aliases", () => {
    const index = counterpartyPhoneIndex([{ oneCId: "a", phone: "89991234567", phones: ["89991234567"] }, { oneCId: "b", phones: ["89991234567"] }]);
    expect(index.get("89991234567")?.size).toBe(2);
  });
});
