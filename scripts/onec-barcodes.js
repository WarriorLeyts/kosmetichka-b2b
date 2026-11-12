// All barcodes of products from 1С (register «Штрихкоды номенклатуры») over OData — the standard exchange
// gives one barcode per product only. Pure parts here are tested in lib/barcodes.test.ts.
import { odataGet } from "./onec-odata.js";

const REG = "InformationRegister_ШтрихкодыНоменклатуры";
const EMPTY = "00000000-0000-0000-0000-000000000000";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** register rows → [{ barcode, productGuid, unitRef }] (no empty barcodes, no repeats) */
export function normalizeBarcodeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const barcode = String(r.Штрихкод ?? "").trim();
    const productGuid = String(r.Номенклатура_Key ?? "");
    if (!barcode || !GUID.test(productGuid) || productGuid === EMPTY) continue;
    const key = `${barcode}|${productGuid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const unit = String(r.ЕдиницаИзмерения_Key ?? "");
    out.push({ barcode, productGuid, unitRef: GUID.test(unit) && unit !== EMPTY ? unit : null });
  }
  return out;
}

/** The products of an exchange file (import.xml «Товар», offers.xml «Предложение»): their 1С ids. */
export function productGuidsInXml(xml) {
  const out = new Set();
  const re = /<(?:Товар|Предложение)>\s*<Ид>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  let m;
  while ((m = re.exec(xml))) out.add(m[1].toLowerCase());
  return out;
}

/** a full package (not only changes) */
export function isFullPackage(xml) {
  return /СодержитТолькоИзменения="false"/.test(xml.slice(0, 4000));
}

/**
 * What to write: rows of 1С vs rows on the site, for the products checked.
 * @typedef {{ barcode: string, productGuid: string, unitRef: string | null }} BarcodeRow
 * @param {BarcodeRow[]} want
 * @param {BarcodeRow[]} have
 * @returns {{ add: BarcodeRow[], change: BarcodeRow[], remove: BarcodeRow[] }}
 */
export function diffBarcodes(want, have) {
  const key = (r) => `${r.barcode}|${r.productGuid}`;
  const haveMap = new Map(have.map((r) => [key(r), r]));
  const wantMap = new Map(want.map((r) => [key(r), r]));
  const add = want.filter((r) => !haveMap.has(key(r)));
  const change = want.filter((r) => haveMap.has(key(r)) && (haveMap.get(key(r)).unitRef ?? null) !== (r.unitRef ?? null));
  const remove = have.filter((r) => !wantMap.has(key(r)));
  return { add, change, remove };
}

/** All rows of the register (≈19 000, ~3 s). */
export async function fetchAllBarcodes(env = process.env) {
  const rows = [];
  for (let skip = 0; ; skip += 20000) {
    const part = await odataGet(REG, { $select: "Штрихкод,Номенклатура_Key,ЕдиницаИзмерения_Key", $top: "20000", $skip: String(skip) }, env);
    rows.push(...part);
    if (part.length < 20000) break;
  }
  return normalizeBarcodeRows(rows);
}

/** Rows of the given products only (20 per request). */
export async function fetchBarcodesOf(guids, env = process.env) {
  const rows = [];
  const list = [...new Set(guids)].filter((g) => GUID.test(g));
  for (let i = 0; i < list.length; i += 20) {
    const part = list.slice(i, i + 20);
    rows.push(...(await odataGet(REG, { $select: "Штрихкод,Номенклатура_Key,ЕдиницаИзмерения_Key", $filter: part.map((g) => `Номенклатура_Key eq guid'${g}'`).join(" or ") }, env)));
  }
  return normalizeBarcodeRows(rows);
}

/** unit ref → name, for the packaging units in use (unknown ones stay without a name). */
export async function unitNames(refs, env = process.env) {
  const out = new Map();
  const list = [...new Set(refs.filter(Boolean))];
  for (let i = 0; i < list.length; i += 20) {
    const part = list.slice(i, i + 20);
    try {
      const rows = await odataGet("Catalog_КлассификаторЕдиницИзмерения", { $select: "Ref_Key,Description", $filter: part.map((g) => `Ref_Key eq guid'${g}'`).join(" or ") }, env);
      for (const r of rows) out.set(r.Ref_Key, String(r.Description || "").trim());
    } catch {
      // another unit catalog — no name
    }
  }
  return out;
}
