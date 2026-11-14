import { cardGivesDiscount } from "@/lib/discountCardRule";
import { bonusesOn } from "@/lib/maxma";
/** Retail customers («Розница») can register on the website too (was wholesale-only). */
export const SITE_RETAIL_ENABLED = true;

/**
 * A retail customer («Розница») with a MAXMA loyalty card linked pays the discount price («Скидка по
 * карте») — in the catalogue, the cart and the order; without the card — retail. First on the
 * website, now in the phone apps too (APPS_TOO). Turn off: set to false (and the app's src/siteMode.ts).
 */
export const SITE_RETAIL_DISCOUNT = true;
/** the same card pricing rules in the phone apps */
export const APPS_TOO = true;

/** The request comes from the website (the browser build of the app sends this header). */
export function fromSite(request: Request): boolean {
  return request.headers.get("x-kosmetichka-client") === "web";
}

/**
 * The customer as the prices see him: «Розница» with a discount card → «Скидка по карте». A discount card:
 * its owner belongs to the 1С group «Максма Скидка» (lib/discountCard.ts).
 */
export function pricingCustomer<T extends { priceType?: string | null; loyaltyCard?: string | null; maxmaDiscount?: boolean | null; maxmaRetail?: boolean | null }>(customer: T, request: Request): T {
  const card = cardGivesDiscount(customer);
  const here = APPS_TOO || fromSite(request);
  return SITE_RETAIL_DISCOUNT && here && ["retail", "discount"].includes(customer.priceType ?? "") ? { ...customer, priceType: card ? "discount" : "retail" } : customer;
}

/** One switch controls bonus accrual and spending on the website and in the apps. */
export function bonusSpendOff(_request: Request): boolean {
  return !bonusesOn();
}
