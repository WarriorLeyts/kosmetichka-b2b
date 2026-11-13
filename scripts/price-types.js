/** Keep promotional 1C prices separate from the four regular tariffs. */
export function normalizePriceType(name) {
  const value = String(name || "").trim().toLowerCase().replace(/ё/g, "е");
  const promo = value.includes("акци");
  if (value.includes("круп")) return promo ? "promo_big_wholesale" : "big_wholesale";
  if (value.includes("опт")) return promo ? "promo_wholesale" : "wholesale";
  if (!promo && value.includes("скид")) return "discount";
  if (value.includes("роз")) return promo ? "promo_retail" : "retail";
  return value;
}
