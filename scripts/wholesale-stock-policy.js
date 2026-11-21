import { wholesaleAvailable, WHOLESALE_SHOP_KEEP } from './onec-helpers.js';

/** 1C category «Парфюм оригинал». Product names/brands never grant the exception. */
export const ORIGINAL_PERFUME_CATEGORY = '620c6b61-4a10-11f1-a231-d45d64282814';

/** Includes future nested groups; other perfume, copies, decants and gift sets keep their policy. */
export function originalPerfumeCategories(categories) {
  const selected = new Set([ORIGINAL_PERFUME_CATEGORY]);
  const normalize = value => String(value ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  for (const c of categories) if (normalize(c.name) === 'парфюм оригинал') selected.add(c.guid);
  for (let i = 0; i < categories.length; i++) {
    let added = false;
    for (const c of categories) if (selected.has(c.parentGuid) && !selected.has(c.guid)) { selected.add(c.guid); added = true; }
    if (!added) break;
  }
  return selected;
}

/** Original perfume can use the last shop unit; other products keep the 12-unit reserve. */
export function shopReserve(product, categories) {
  return categories.has(product.categoryGuid) || categories.has(product.categoryGuid1C) ? 0 : WHOLESALE_SHOP_KEEP;
}

/** Refresh materialised availability after classification changes or initial policy rollout.
 * Does not change physical stock, prices, visibility or send restock messages. CAS avoids replacing
 * a stock value concurrently updated by the next 1C exchange. */
export async function refreshWholesaleStock(db, { onlyOriginal = false } = {}) {
  const categories = originalPerfumeCategories(await db.category.findMany({ select: { guid: true, name: true, parentGuid: true } }));
  const rows = await db.product.findMany({
    ...(onlyOriginal ? { where: { OR: [{ categoryGuid: { in: [...categories] } }, { categoryGuid1C: { in: [...categories] } }] } } : {}),
    select: { id: true, stock: true, wholesaleStock: true, categoryGuid: true, categoryGuid1C: true, warehouseStock: { select: { warehouseGuid: true, qty: true } } },
  });
  let changed = 0, skipped = 0;
  for (const product of rows) {
    const split = product.warehouseStock.length ? product.warehouseStock.map(w => ({ guid: w.warehouseGuid, qty: w.qty })) : null;
    const available = !(Number(product.stock) > 0) ? 0 : wholesaleAvailable(product.stock, split, undefined, shopReserve(product, categories));
    if (available === product.wholesaleStock) continue;
    const result = await db.product.updateMany({ where: { id: product.id, stock: product.stock, wholesaleStock: product.wholesaleStock }, data: { wholesaleStock: available } });
    changed += result.count; skipped += 1 - result.count;
  }
  return { checked: rows.length, changed, skipped };
}
