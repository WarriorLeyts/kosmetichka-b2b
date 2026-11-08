import { describe, expect, it } from "vitest";
import { contractPriceType, odataConfigured as isConfigured } from "../scripts/onec-odata.js";

const kinds = new Map([["k-opt", "Опт"], ["k-big", "Крупный опт"], ["k-disc", "Скидка"]]);

describe("counterparties from 1С over OData", () => {
  it("is used only when all three ODATA_* are set", () => {
    const odataConfigured = (env: Record<string, string>) => isConfigured(env as unknown as NodeJS.ProcessEnv);
    expect(odataConfigured({ ODATA_BASE_URL: "http://x", ODATA_USER: "u", ODATA_PASSWORD: "p" })).toBe(true);
    expect(odataConfigured({ ODATA_BASE_URL: "http://x", ODATA_USER: "u" })).toBe(false);
    expect(odataConfigured({})).toBe(false);
  });

  it("price type: «Основной договор» with the latest code, buyer contracts only, deleted ones skipped", () => {
    const c = (Description: string, Code: string, ВидЦен_Key: string, extra = {}) => ({ Description, Code, ВидЦен_Key, ВидДоговора: "СПокупателем", DeletionMark: false, ...extra });
    expect(contractPriceType([c("опт", "A1", "k-opt"), c("Основной договор", "A2", "k-disc"), c("Основной договор", "A3", "k-big")], kinds)).toBe("Крупный опт");
    expect(contractPriceType([c("Основной договор", "A2", "k-disc"), c("Основной договор", "A9", "k-opt", { DeletionMark: true })], kinds)).toBe("Скидка");
    expect(contractPriceType([c("опт", "A1", "k-opt"), c("Поставка", "A5", "k-big", { ВидДоговора: "СПоставщиком" })], kinds)).toBe("Опт");
    expect(contractPriceType([], kinds)).toBe("");
  });
});
