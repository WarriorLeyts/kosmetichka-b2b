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
    await db.product.updateMany({ where: { guid: { in: missing.slice(i, i + 1000) } }, data: { stock: 0, wholesaleStock: 0 } });
    await db.productWarehouseStock?.deleteMany({ where: { productGuid: { in: missing.slice(i, i + 1000) } } });
  }
  console.log(`[1c] ${label}: нет в полной выгрузке, остаток обнулён: ${missing.length}`);
  return missing.length;
}


// ── Stock per warehouse («Разбивать остатки по складам» in the 1C integration) ──────────────────
// Staff only: customers see Product.stock (the total), the split goes to ProductWarehouseStock.

function arr(v) {
  if (v === undefined || v === null || v === "") return [];
  return Array.isArray(v) ? v : [v];
}

function num(v) {
  const n = Number(String(v ?? "").replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** guid → name of the warehouses listed in a package («Склады» of ПакетПредложений or Классификатор). */
export function warehouseNames(node) {
  const names = new Map();
  for (const w of arr(node?.Склады?.Склад)) {
    const guid = String(w?.Ид ?? "").trim();
    if (guid) names.set(guid, String(w?.Наименование ?? "").trim() || guid);
  }
  return names;
}

/**
 * Stock of one offer per warehouse → [{ guid, qty }] (qty summed if a warehouse repeats), or null when
 * the offer carries no split (the setting is off). Both CommerceML forms:
 *   2.08: <Склад ИдСклада="…" КоличествоНаСкладе="5"/>
 *   2.10: <Остатки><Остаток><Склад><Ид>…</Ид><Количество>5</Количество></Склад></Остаток></Остатки>
 */
export function offerWarehouseStock(offer) {
  const byGuid = new Map();
  let seen = false;
  const add = (guid, qty) => {
    const g = String(guid ?? "").trim();
    if (!g) return;
    seen = true;
    byGuid.set(g, (byGuid.get(g) ?? 0) + num(qty));
  };
  for (const w of arr(offer?.Склад)) {
    if (typeof w !== "object") continue;
    add(w.ИдСклада ?? w.Ид, w.КоличествоНаСкладе ?? w.Количество);
  }
  for (const r of arr(offer?.Остатки?.Остаток)) {
    for (const w of arr(r?.Склад)) {
      if (typeof w !== "object") continue;
      add(w.Ид ?? w.ИдСклада, w.Количество ?? w.КоличествоНаСкладе);
    }
  }
  if (!seen) return null;
  return [...byGuid].map(([guid, qty]) => ({ guid, qty }));
}

/**
 * Total stock of an offer (what customers see): <Количество> as before; when 1C sends only the split,
 * the sum over the warehouses.
 */
/** «1. Мега Косметичка» — the shop: at least 12 of each product stay on its shelves for wholesalers */
export const SHOP_WAREHOUSE_GUID = process.env.ONEC_SHOP_WAREHOUSE || "bd887c46-1148-11f1-80cf-10ffe0cbb38c";
export const WHOLESALE_SHOP_KEEP = 12;

/**
 * What a wholesaler may order (owner, 2026-11-09): the shop's stock minus the 12 it keeps, plus everything
 * on the other warehouses («0. Склад»). Without the split the whole stock counts as the shop's.
 */
export function wholesaleAvailable(total, split, shopGuid = SHOP_WAREHOUSE_GUID) {
  const free = (q) => Math.max(0, Math.floor(q) - WHOLESALE_SHOP_KEEP);
  if (!split) return free(Number(total) || 0);
  let shop = 0;
  let other = 0;
  for (const w of split) {
    if (w.guid === shopGuid) shop += Math.max(0, w.qty);
    else other += Math.max(0, w.qty);
  }
  return free(shop) + Math.floor(other);
}

export function offerTotalStock(offer, split) {
  const q = offer?.Количество;
  if (q !== undefined && q !== null && q !== "" && typeof q !== "object") return num(q);
  if (split) return split.reduce((s, w) => s + Math.max(0, w.qty), 0);
  return 0;
}
