import { describe, it, expect } from "vitest";
import { LEGACY_CAMPAIGN, campaignActive, type Campaign } from "./campaign";
import { calculateCart, priceFor, cartPriceTier, bigWholesaleMinOrder } from "./pricing";
import { campaignFromPromo, promoSchema } from "./promoSchema";
const rules: Campaign = { enabled: true, name: "Декабрь", startsAt: "2026-12-10T00:00:00+03:00", endsAt: "2026-12-13T00:00:00+03:00", usePromoPrices: true, wholesaleMin: 6000, bigWholesaleMin: 30000, discountSteps: [{ from: 50000, percent: 4 }, { from: 100000, percent: 7 }] };
const at = Date.parse(rules.startsAt!);
const item = (price: number, promo?: number) => ({ retailPrice: price, discountPrice: price, wholesalePrice: price, bigWholesalePrice: price, promoWholesalePrice: promo, promoBigWholesalePrice: promo, quantity: 1 });
describe("published campaign rules", () => {
  it("preserves November before the first configured publication", () => { expect(campaignFromPromo(promoSchema.parse({}))).toEqual(LEGACY_CAMPAIGN); });
  it("starts and ends exactly at Moscow boundaries; disabling overrides dates", () => {
    expect(campaignActive(rules, at-1)).toBe(false); expect(campaignActive(rules, at)).toBe(true);
    const end=Date.parse(rules.endsAt!); expect(campaignActive(rules,end-1)).toBe(true); expect(campaignActive(rules,end)).toBe(false);
    expect(priceFor(item(100,50),"wholesale",at,{...rules,enabled:false})).toBe(100);
    expect(bigWholesaleMinOrder(end,rules)).toBe(50000);
  });
  it("uses new thresholds and returns to ordinary thresholds after the end", () => {
    expect(cartPriceTier([item(5500)],{priceType:"wholesale"},at,rules)).toBe("discount");
    expect(cartPriceTier([item(30000)],{priceType:"wholesale"},at,rules)).toBe("big_wholesale");
    expect(cartPriceTier([item(30000)],{priceType:"wholesale"},Date.parse(rules.endsAt!),rules)).toBe("wholesale");
  });
  it("uses only matching promotional prices; disabled 1C prices become eligible for discount", () => {
    expect(priceFor(item(100,50),"retail",at,rules)).toBe(100);
    const cart=[item(80000),item(30000,20000)];
    const result=calculateCart(cart,{priceType:"wholesale"},at,rules);
    expect(result).toMatchObject({subtotal:100000,eligibleSubtotal:80000,percent:7,discount:5600,total:94400});
    expect(result.discounts.reduce((a,b)=>a+b,0)).toBe(result.discount);
    expect(calculateCart(cart,{priceType:"wholesale"},at,{...rules,usePromoPrices:false})).toMatchObject({subtotal:110000,eligibleSubtotal:110000,discount:7700});
    expect(calculateCart(cart,{priceType:"retail"},at,rules).discount).toBe(0);
  });
  it("rejects reversed dates with different offsets and invalid steps", () => {
    expect(promoSchema.safeParse({ startsAt:"2026-12-10T10:00:00+03:00", endsAt:"2026-12-10T11:00:00+05:00" }).success).toBe(false);
    const pricing={usePromoPrices:true,wholesaleMin:6000,bigWholesaleMin:5000,discountSteps:[]};
    expect(promoSchema.safeParse({pricing}).success).toBe(false);
    expect(promoSchema.safeParse({pricing:{...pricing,bigWholesaleMin:30000,discountSteps:[{from:10000,percent:5},{from:5000,percent:3}]}}).success).toBe(false);
  });
});
