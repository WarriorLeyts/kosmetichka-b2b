import {describe,expect,it} from "vitest";
import {promotionProductsWhere} from "./promotionProducts";
const during=Date.parse("2026-11-13T12:00:00+03:00");
describe("promotion-only catalog",()=>{
  it("limits retail and guest catalogs to retail promotions",()=>{
    for(const type of ["guest","retail","discount"] as const)
      expect(promotionProductsWhere(type,during)).toEqual({prices:{some:{priceType:{in:["promo_retail"]},price:{gt:0}}}});
  });
  it("includes each promotional column visible to wholesalers",()=>{
    for(const type of ["wholesale","big_wholesale"] as const)
      expect(promotionProductsWhere(type,during)).toEqual({prices:{some:{priceType:{in:["promo_retail","promo_wholesale","promo_big_wholesale"]},price:{gt:0}}}});
  });
  it("never includes stale promotions outside the Moscow campaign dates",()=>{
    for(const now of [Date.parse("2026-11-12T23:59:59.999+03:00"),Date.parse("2026-12-01T00:00:00+03:00")])
      expect(promotionProductsWhere("wholesale",now)).toEqual({id:{in:[]}});
  });
});
