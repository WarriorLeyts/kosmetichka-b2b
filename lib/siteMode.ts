import { cardGivesDiscount } from "@/lib/discountCardRule";
/** Retail customers («Розница») can register on the website too (was wholesale-only). */
export const SITE_RETAIL_ENABLED = true;

/**
 * A retail customer («Розница») with a MAXMA loyalty card linked pays the discount price («Скидка по
 * карте») — in the catalogue, the cart and the order; without the card — retail. First on the
 * website, now in the phone apps too (APPS_TOO). Turn off: set to false (and the app's src/siteMode.ts).
 */
export const SITE_RETAIL_DISCOUNT = true;
/** the same rules in the phone apps (card → discount price, no bonus spending) */
export const APPS_TOO = true;

/** The request comes from the website (the browser build of the app sends this header). */
export function fromSite(request: Request): boolean {
  return request.headers.get("x-kosmetichka-client") === "web";
}

/**
 * The customer as the prices see him: «Розница» with a discount card → «Скидка по карте». A discount card:
 * number «900…» or its owner in the 1С group «Максма Скидка» (lib/discountCard.ts).
 */
export function pricingCustomer<T extends { priceType?: string | null; loyaltyCard?: string | null; maxmaDiscount?: boolean | null }>(customer: T, request: Request): T {
  const card = cardGivesDiscount(customer);
  const here = APPS_TOO || fromSite(request);
  return SITE_RETAIL_DISCOUNT && here && customer.priceType === "retail" && card ? { ...customer, priceType: "discount" } : customer;
}

/** Bonuses are collected but not spent (owner's decision) — on the website, and with APPS_TOO in the apps. */
export function bonusSpendOff(request: Request): boolean {
  return APPS_TOO || fromSite(request);
}
