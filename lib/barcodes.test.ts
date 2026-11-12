import { describe, expect, it } from "vitest";
import { diffBarcodes, isFullPackage, normalizeBarcodeRows, productGuidsInXml } from "../scripts/onec-barcodes.js";
import { productSearchWhere } from "./productSearch";

const G1 = "0d403430-7940-11ee-9a3a-f4b5203bf9a5";
const G2 = "a8e8085e-9ff8-11ef-b077-00ebd8fb52e5";
const EMPTY = "00000000-0000-0000-0000-000000000000";

describe("all barcodes of products from 1С", () => {
  it("register rows: no empty barcodes, no repeats, a packaging unit only when set", () => {
    const rows = normalizeBarcodeRows([
      { Штрихкод: " 4601234567890 ", Номенклатура_Key: G1, ЕдиницаИзмерения_Key: EMPTY },
      { Штрихкод: "4601234567890", Номенклатура_Key: G1, ЕдиницаИзмерения_Key: EMPTY },
      { Штрихкод: "", Номенклатура_Key: G1 },
      { Штрихкод: "2020000003427", Номенклатура_Key: G2, ЕдиницаИзмерения_Key: G1 },
      { Штрихкод: "111", Номенклатура_Key: EMPTY },
    ]);
    expect(rows).toEqual([
      { barcode: "4601234567890", productGuid: G1, unitRef: null },
      { barcode: "2020000003427", productGuid: G2, unitRef: G1 },
    ]);
  });

  it("the products of an exchange file; a full package", () => {
    const xml = `<КоммерческаяИнформация><Каталог СодержитТолькоИзменения="true"><Товары><Товар>\n<Ид>${G1}</Ид></Товар><Товар><Ид>${G2.toUpperCase()}</Ид></Товар></Товары></Каталог><ПакетПредложений><Предложения><Предложение><Ид>${G1}#x</Ид></Предложение></Предложения></ПакетПредложений>`;
    expect([...productGuidsInXml(xml)].sort()).toEqual([G1, G2].sort());
    expect(isFullPackage(xml)).toBe(false);
    expect(isFullPackage('<ПакетПредложений СодержитТолькоИзменения="false">')).toBe(true);
  });

  it("what to write: adds, unit changes, removals", () => {
    const want = [
      { barcode: "1", productGuid: G1, unitRef: null },
      { barcode: "2", productGuid: G1, unitRef: G2 },
    ];
    const have = [
      { barcode: "2", productGuid: G1, unitRef: null },
      { barcode: "3", productGuid: G1, unitRef: null },
    ];
    const d = diffBarcodes(want, have);
    expect(d.add.map((r) => r.barcode)).toEqual(["1"]);
    expect(d.change.map((r) => r.barcode)).toEqual(["2"]);
    expect(d.remove.map((r) => r.barcode)).toEqual(["3"]);
  });

  it("search by digits also looks at all barcodes; words don't", () => {
    expect(JSON.stringify(productSearchWhere("4601234567890"))).toContain('"barcodes"');
    expect(JSON.stringify(productSearchWhere("шампунь"))).not.toContain('"barcodes"');
  });
});
