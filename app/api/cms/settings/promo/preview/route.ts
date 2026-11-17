import { NextResponse } from "next/server";
import { z } from "zod";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { parseBody } from "@/lib/cms/validate";
import { promoSchema, campaignFromPromo } from "@/lib/promoSchema";
import { calculateCart } from "@/lib/pricing";
const schema = z.object({ settings: promoSchema, subtotal: z.number().int().min(1).max(100000000), shockSubtotal: z.number().int().min(0).max(100000000), customer: z.enum(["retail", "discount", "wholesale", "big_wholesale"]) }).refine(v => v.shockSubtotal <= v.subtotal, { message: "Сумма акционных товаров не может превышать общую" });
/** A dry run of the real pricing engine: no orders, prices or campaign settings are written. */
export async function POST(request: Request) {
  const g = await cmsGuard(request, "settings.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, schema);
  if (body instanceof NextResponse) return body;
  const campaign = campaignFromPromo(body.settings);
  const flat = (n: number) => ({ retailPrice: n, discountPrice: n, wholesalePrice: n, bigWholesalePrice: n, quantity: 1 });
  const cart = [flat(body.subtotal - body.shockSubtotal), { ...flat(body.shockSubtotal), promoRetailPrice: body.shockSubtotal, promoWholesalePrice: body.shockSubtotal, promoBigWholesalePrice: body.shockSubtotal }].filter(p => p.retailPrice > 0);
  const at = campaign.startsAt ? Date.parse(campaign.startsAt) : Date.now();
  return NextResponse.json({ pricing: calculateCart(cart, { priceType: body.customer }, at, campaign), at: new Date(at).toISOString() });
}
