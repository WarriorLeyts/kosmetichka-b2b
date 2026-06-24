import { readFileSync } from "fs";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
ignoreAttributes: false,
attributeNamePrefix: "",
});

const xml = readFileSync("./data/1c/offers.xml", "utf8");
const result = parser.parse(xml);

const offers =
result.КоммерческаяИнформация
.ПакетПредложений
.Предложения
.Предложение;

const first = offers[0];

console.log("Название:", first.Наименование);
console.log("Остаток:", first.Количество);

const prices = first.Цены.Цена;

const cleanProduct = {
guid: first.Ид,
name: first.Наименование,
barcode: String(first.Штрихкод || ""),
stock: Number(first.Количество || 0),
prices: first.Цены.Цена.map((price) => ({
priceTypeGuid: price.ИдТипаЦены,
price: Number(price.ЦенаЗаЕдиницу),
})),
};

console.log(cleanProduct);