/**
 * The price type a new account gets. «Крупный опт» is never given at registration: the customer gets «Опт»
 * and a manager sets «Крупный опт» in the admin (the request is kept for him). From 1C only «Опт» is taken;
 * «Крупный опт» in 1C is ignored, and 1C itself is not changed. (scripts/import-customers.js: same rule.)
 */
export function registrationPriceType(chosen: string, oneCType: string | null | undefined): string {
  if (chosen === "big_wholesale") return "wholesale";
  if (oneCType === "wholesale") return "wholesale";
  return chosen;
}
