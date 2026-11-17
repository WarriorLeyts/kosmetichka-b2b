import { prisma } from "./prisma";
import { campaignFromPromo, readPromo, PROMO_SETTINGS_KEY } from "./promoSchema";
/** Read once per calculation/request, never a mutable process-wide pricing policy. */
export async function getCampaign() {
  const row = await prisma.cmsSetting.findUnique({ where: { key: PROMO_SETTINGS_KEY } });
  return campaignFromPromo(readPromo(row?.value));
}
