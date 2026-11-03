/**
 * The website is for wholesale customers only for now: registration, price types and the cart
 * offer «Опт» and «Крупный опт». Retail («Розница», «Скидка», MAXMA card) lives in the app.
 * Turn back on: set to true.
 */
export const SITE_RETAIL_ENABLED = false;

/**
 * On the website a retail customer («Розница») with a MAXMA loyalty card linked pays the discount
 * price («Скидка по карте») — in the catalogue, the cart and the order; without the card — retail.
 * The phone apps keep retail prices. Turn off: set to false (and SITE_RETAIL_DISCOUNT in the app's
 * src/siteMode.ts).
 */
export const SITE_RETAIL_DISCOUNT = true;

/** The request comes from the website (the browser build of the app sends this header). */
export function fromSite(request: Request): boolean {
  return request.headers.get("x-kosmetichka-client") === "web";
}

/** The customer as the prices see him: on the website «Розница» with a linked card → «Скидка по карте». */
export function pricingCustomer<T extends { priceType?: string | null; loyaltyCard?: string | null }>(customer: T, request: Request): T {
  const card = Boolean(customer.loyaltyCard?.trim());
  return SITE_RETAIL_DISCOUNT && customer.priceType === "retail" && card && fromSite(request) ? { ...customer, priceType: "discount" } : customer;
}
