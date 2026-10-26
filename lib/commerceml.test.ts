import { describe, expect, it } from "vitest";
import { cmlComment, cmlItemDiscounts, cmlItemSum } from "./commerceml";

describe("CommerceML bonuses", () => {
  it("promo only: unchanged output", () => {
    const item = { total: 200, discount: 20, bonusDiscount: 0 };
    expect(cmlItemSum(item)).toBe(180);
    expect(cmlItemDiscounts(item, "SALE", "  ")).toBe(
      "\n  <Скидки>\n    <Скидка>\n      <Наименование>Промокод SALE</Наименование>\n      <Сумма>20</Сумма>\n      <УчтеноВСумме>true</УчтеноВСумме>\n    </Скидка>\n  </Скидки>"
    );
    expect(cmlComment({ comment: "x", promoCode: "SALE", discount: 20, bonusesApplied: 0 })).toBe("x | Промокод SALE, скидка 20 руб.");
    expect(cmlComment({ comment: null, promoCode: null, discount: 0, bonusesApplied: 0 })).toBe("");
  });

  it("bonuses: second discount, sum reduced, comment", () => {
    const item = { total: 200, discount: 20, bonusDiscount: 30 };
    expect(cmlItemSum(item)).toBe(150);
    const xml = cmlItemDiscounts(item, "SALE", "");
    expect(xml).toContain("<Наименование>Промокод SALE</Наименование>");
    expect(xml).toContain("<Наименование>Бонусы MAXMA</Наименование>\n    <Сумма>30</Сумма>");
    expect(cmlItemDiscounts({ total: 100, discount: 0, bonusDiscount: 10 }, null, "")).not.toContain("Промокод");
    expect(cmlComment({ comment: "", promoCode: "SALE", discount: 20, bonusesApplied: 30 })).toBe("Промокод SALE, скидка 20 руб., списано бонусов 30");
    expect(cmlComment({ comment: "x", promoCode: null, discount: 0, bonusesApplied: 30 })).toBe("x | Списано бонусов 30");
  });
});
