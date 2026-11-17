import { LEGACY_CAMPAIGN, type Campaign } from "./campaign";
import type { Prisma } from "@prisma/client";
import { pricingCampaignActive, type PriceType } from "./pricing";

/** Match the promotion prices visible in this viewer's price panel. */
export function promotionProductsWhere(type:PriceType, now=Date.now(), campaign: Campaign = LEGACY_CAMPAIGN):Prisma.ProductWhereInput {
  if(!pricingCampaignActive(now, campaign) || !campaign.usePromoPrices)return {id:{in:[]}};
  const types=type==="wholesale"||type==="big_wholesale"
    ? ["promo_retail","promo_wholesale","promo_big_wholesale"] : ["promo_retail"];
  return {prices:{some:{priceType:{in:types},price:{gt:0}}}};
}
