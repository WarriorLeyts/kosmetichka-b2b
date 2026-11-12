// All barcodes of products from 1С over OData → «ProductBarcode».
//   node scripts/import-barcodes.js          after an exchange: only the products of import.xml / offers.xml that
//                                              changed since the last run (a full package → everything)
//   node scripts/import-barcodes.js --all    everything, adds and removes (hourly, lib/barcodesSync.ts)
import fs from "fs";
import nodePath from "path";
import { PrismaClient } from "@prisma/client";
import { odataConfigured } from "./onec-odata.js";
import { diffBarcodes, fetchAllBarcodes, fetchBarcodesOf, isFullPackage, productGuidsInXml, unitNames } from "./onec-barcodes.js";

const prisma = new PrismaClient();
const APP_ROOT = process.env.APP_ROOT || process.cwd();
const DATA_1C = nodePath.join(process.env.DATA_DIR || nodePath.join(APP_ROOT, "data"), "1c");
const STATE = nodePath.join(DATA_1C, ".barcodes-state.json");
const FILES = ["import.xml", "offers.xml"];

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}

/** null → check everything; [] → nothing came; [...] → these products */
function productsOfNewFiles(state) {
  const guids = new Set();
  let full = false;
  for (const f of FILES) {
    const p = nodePath.join(DATA_1C, f);
    if (!fs.existsSync(p)) continue;
    const mtime = fs.statSync(p).mtimeMs;
    if (state[f] === mtime) continue;
    state[f] = mtime;
    const xml = fs.readFileSync(p, "utf8");
    if (isFullPackage(xml)) full = true;
    for (const g of productGuidsInXml(xml)) guids.add(g);
  }
  if (full || guids.size > 1000) return null;
  return [...guids];
}

async function main() {
  if (!odataConfigured()) {
    console.log("Штрихкоды: OData не настроен — пропуск");
    return;
  }
  const all = process.argv.includes("--all");
  const state = readState();
  let scope = all ? null : productsOfNewFiles(state);
  if (scope && scope.length === 0) {
    console.log("Штрихкоды: новых товаров в обмене нет");
    return;
  }
  // only products the site has (the table refers to them)
  const siteGuids = new Set((await prisma.product.findMany({ select: { guid: true } })).map((p) => p.guid));
  if (scope) scope = scope.filter((g) => siteGuids.has(g));

  const want = (scope ? await fetchBarcodesOf(scope) : await fetchAllBarcodes()).filter((r) => siteGuids.has(r.productGuid));
  const have = await prisma.productBarcode.findMany({
    where: scope ? { productGuid: { in: scope } } : {},
    select: { barcode: true, productGuid: true, unitRef: true },
  });
  const { add, change, remove } = diffBarcodes(want, have);
  const names = await unitNames([...add, ...change].map((r) => r.unitRef));

  for (let i = 0; i < add.length; i += 1000) {
    await prisma.productBarcode.createMany({
      data: add.slice(i, i + 1000).map((r) => ({ ...r, unitName: r.unitRef ? (names.get(r.unitRef) ?? null) : null })),
      skipDuplicates: true,
    });
  }
  for (const r of change) {
    await prisma.productBarcode.update({
      where: { barcode_productGuid: { barcode: r.barcode, productGuid: r.productGuid } },
      data: { unitRef: r.unitRef, unitName: r.unitRef ? (names.get(r.unitRef) ?? null) : null },
    });
  }
  for (const r of remove) {
    await prisma.productBarcode.deleteMany({ where: { barcode: r.barcode, productGuid: r.productGuid } });
  }
  fs.writeFileSync(STATE, JSON.stringify(state));

  const what = scope ? `товаров из обмена: ${scope.length}` : "все товары";
  console.log(`Штрихкоды (${what}): в 1С ${want.length}, добавлено ${add.length}, изменено ${change.length}, удалено ${remove.length}`);
  if (!scope) {
    const shared = new Map();
    for (const r of want) shared.set(r.barcode, (shared.get(r.barcode) ?? 0) + 1);
    const dup = [...shared].filter(([, n]) => n > 1).length;
    if (dup) console.log(`Штрихкоды: ${dup} штрихкодов стоят на нескольких товарах сразу (проверить в 1С)`);
  }
}

main()
  .catch((e) => {
    console.error("Штрихкоды:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
