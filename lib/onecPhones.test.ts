import { describe, expect, it } from "vitest";
import { counterpartyPhones, phonesFromCounterparty, counterpartyPhoneIndex, normalizeCounterpartyPhone } from "../scripts/onec-phones.js";
describe("1C phone aliases", () => {
  it("recovers the current phone from the full name without truncating the malformed search phone", () => {
    const phones = phonesFromCounterparty({ НомерТелефонаДляПоиска: "899933344455, 89991110022", Description: "Тестовый Клиент 89991110022 (899933344455)", НаименованиеПолное: "Тестовый Клиент 89991110022 (89992220033) Город, павильон 7" });
    expect(phones.sort()).toEqual(["89991110022", "89992220033"]);
    expect(normalizeCounterpartyPhone("899933344455")).toBeNull();
    expect(phones).not.toContain("89993334445");
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
