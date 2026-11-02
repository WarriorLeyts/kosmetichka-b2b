// Helpers of the 1C import scripts (import-catalog.js, import-prices.js); no database client of their own.

/** 1C price → roubles with at most 2 decimals: 145.95, never 145.94999999999998 (audit P2-07) */
export function toKopecks(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** 1C marks a product deleted: <Статус>Удален</Статус> or ПометкаУдаления=true (CommerceML 2.0x) */
export function isDeletedIn1C(product) {
  const status = String(product?.Статус ?? product?.["@_Статус"] ?? "").trim().toLowerCase();
  const mark = String(product?.ПометкаУдаления ?? "").trim().toLowerCase();
  return status === "удален" || status === "удалён" || mark === "true";
}

/**
 * A FULL upload (СодержитТолькоИзменения="false") lists every product 1C sells, so the ones missing
 * from it were deleted there: their stock becomes 0 — they can't be ordered, but orders, history and
 * wishlists keep them, and they come back with the next upload that has them. A partial upload (only
 * changes — what 1C sends every 10 minutes) says nothing about the rest and hides nothing.
 * Guard: a "full" file with under 50 % of the in-stock products is taken as broken and ignored.
 */
export async function hideMissing(db, presentGuids, label) {
  const inStock = await db.product.findMany({ where: { stock: { gt: 0 } }, select: { guid: true } });
  const present = new Set(presentGuids);
  const missing = inStock.map((p) => p.guid).filter((g) => !present.has(g));
  if (missing.length === 0) return 0;
  if (presentGuids.length < inStock.length * 0.5) {
    console.error(`[1c] ${label}: полная выгрузка с ${presentGuids.length} товарами из ${inStock.length} в наличии — похоже на обрыв, товары не скрываем`);
    return 0;
  }
  for (let i = 0; i < missing.length; i += 1000) {
    await db.product.updateMany({ where: { guid: { in: missing.slice(i, i + 1000) } }, data: { stock: 0 } });
  }
  console.log(`[1c] ${label}: нет в полной выгрузке, остаток обнулён: ${missing.length}`);
  return missing.length;
}

