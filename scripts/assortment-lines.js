/** Keep detailed variant rows on the site; consolidate only the export to 1C. */
export function aggregateAssortmentLines(items) {
  if (!items.some(i => i.variantName)) return items;
  const groups = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.guid ?? item.productId, item.price]);
    const line = groups.get(key);
    if (line) {
      line.quantity += item.quantity;
      line.total += item.total;
      line.discount += item.discount ?? 0;
      line.bonusDiscount += item.bonusDiscount ?? 0;
    } else groups.set(key, { ...item, discount: item.discount ?? 0, bonusDiscount: item.bonusDiscount ?? 0 });
  }
  return [...groups.values()];
}
export function assortmentComment(items = []) {
  const variants = items.filter(i => i.variantName).map(i => `${i.productName}: ${i.variantName} — ${i.quantity} шт.`);
  return variants.length ? `Ассортимент: ${variants.join("; ")}` : "";
}
