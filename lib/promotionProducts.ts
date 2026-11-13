import type { Prisma } from "@prisma/client";
import { novemberPromoActive, type PriceType } from "./pricing";

/** Match the promotion prices visible in this viewer's price panel. */
export function promotionProductsWhere(type:PriceType, now=Date.now()):Prisma.ProductWhereInput {
  if(!novemberPromoActive(now))return {id:{in:[]}};
  const types=type==="wholesale"||type==="big_wholesale"
    ? ["promo_retail","promo_wholesale","promo_big_wholesale"] : ["promo_retail"];
  return {prices:{some:{priceType:{in:types},price:{gt:0}}}};
}
