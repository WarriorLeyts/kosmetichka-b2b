/**
 * The price type from 1C: only «Опт» is taken. «Крупный опт» in 1C is ignored — big wholesale is what the
 * customer chose on the site at registration or what a manager set in the admin. A customer who chose
 * «Крупный опт» keeps it whatever 1C says. (scripts/import-customers.js has the same rule.)
 */
export function priceTypeFrom1C(siteType: string, oneCType: string | null | undefined): string {
  if (oneCType === "wholesale" && siteType !== "big_wholesale") return "wholesale";
  return siteType;
}
