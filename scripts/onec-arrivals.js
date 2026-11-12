// «Новые поступления» from 1С over OData: receipts (Приходная накладная) to the warehouse «0. Склад» and
// transfers (Перемещение запасов) to the shop «1. Мега Косметичка». Pure parts tested in lib/arrivals.test.ts.
import { odataGet } from "./onec-odata.js";

export const STOCK_NAME = process.env.ARRIVALS_STOCK || "0. Склад";
export const SHOP_NAME = process.env.ARRIVALS_SHOP || "1. Мега Косметичка";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY = "00000000-0000-0000-0000-000000000000";

/** 1С date-time (Moscow wall clock, «2026-11-08T15:14:11») → Date */
export function fromOneC(s) {
  return new Date(String(s).slice(0, 19) + "+03:00");
}

/** first posted receipt of every product, at any warehouse: guid → 1С date string */
export function firstReceipts(heads, lines) {
  const date = new Map(heads.filter((h) => h.Posted && !h.DeletionMark).map((h) => [h.Ref_Key, h.Date]));
  const first = new Map();
  for (const l of lines) {
    const d = date.get(l.Ref_Key);
    const g = l.Номенклатура_Key;
    if (!d || !GUID.test(g || "") || g === EMPTY) continue;
    if (!first.has(g) || d < first.get(g)) first.set(g, d);
  }
  return first;
}

/** document lines → one row per (document, product): quantities summed */
export function arrivalRows(docs, lines, place, first) {
  const byRef = new Map(docs.map((d) => [d.Ref_Key, d]));
  const rows = new Map();
  for (const l of lines) {
    const d = byRef.get(l.Ref_Key);
    const g = l.Номенклатура_Key;
    if (!d || !GUID.test(g || "") || g === EMPTY) continue;
    const key = `${d.Ref_Key}|${g}`;
    const prev = rows.get(key);
    const qty = Number(l.Количество) || 0;
    if (prev) prev.qty += qty;
    else
      rows.set(key, {
        productGuid: g,
        place,
        docRef: d.Ref_Key,
        docNumber: String(d.Number || "").trim(),
        docDate: fromOneC(d.Date),
        qty,
        firstReceiptAt: first.has(g) ? fromOneC(first.get(g)) : null,
      });
  }
  return [...rows.values()].filter((r) => r.qty > 0);
}

async function all(entity, params, page, env) {
  const out = [];
  for (let skip = 0; ; skip += page) {
    const part = await odataGet(entity, { ...params, $top: String(page), $skip: String(skip) }, env);
    out.push(...part);
    if (part.length < page) return out;
  }
}

async function linesOf(entity, refs, select, env) {
  const out = [];
  for (let i = 0; i < refs.length; i += 20) {
    const part = refs.slice(i, i + 20);
    out.push(...(await odataGet(entity, { $select: select, $filter: part.map((r) => `Ref_Key eq guid'${r}'`).join(" or ") }, env)));
  }
  return out;
}

/** Rows of the period (since — 1С date string) for both places. */
export async function fetchArrivals(since, env = process.env) {
  const units = await odataGet("Catalog_СтруктурныеЕдиницы", { $select: "Ref_Key,Description,DeletionMark" }, env);
  const ref = (name) => units.find((u) => !u.DeletionMark && String(u.Description || "").trim() === name)?.Ref_Key;
  const stock = ref(STOCK_NAME);
  const shop = ref(SHOP_NAME);
  if (!stock || !shop) throw new Error(`В 1С нет склада «${!stock ? STOCK_NAME : SHOP_NAME}»`);

  // the whole history of receipts (≈1 000 documents, ≈20 000 lines): when each product came first
  const rHeads = await all("Document_ПриходнаяНакладная", { $select: "Ref_Key,Number,Date,Posted,DeletionMark,СтруктурнаяЕдиница_Key", $orderby: "Ref_Key" }, 5000, env);
  const rLines = await all("Document_ПриходнаяНакладная_Запасы", { $select: "Ref_Key,Номенклатура_Key,Количество" }, 50000, env);
  const first = firstReceipts(rHeads, rLines);

  const receipts = rHeads.filter((h) => h.Posted && !h.DeletionMark && h.Date >= since && h.СтруктурнаяЕдиница_Key === stock);
  const rRefs = new Set(receipts.map((h) => h.Ref_Key));
  const rows = arrivalRows(receipts, rLines.filter((l) => rRefs.has(l.Ref_Key)), "stock", first);

  const tHeads = (
    await odataGet("Document_ПеремещениеЗапасов", { $select: "Ref_Key,Number,Date,Posted,DeletionMark,СтруктурнаяЕдиница_Key,СтруктурнаяЕдиницаПолучатель_Key", $filter: `Date ge datetime'${since}'` }, env)
  ).filter((h) => h.Posted && !h.DeletionMark && h.СтруктурнаяЕдиницаПолучатель_Key === shop && h.СтруктурнаяЕдиница_Key !== shop);
  const tLines = await linesOf("Document_ПеремещениеЗапасов_Запасы", tHeads.map((h) => h.Ref_Key), "Ref_Key,Номенклатура_Key,Количество", env);
  rows.push(...arrivalRows(tHeads, tLines, "shop", first));
  return { rows, receipts: receipts.length, transfers: tHeads.length };
}
