import { readFileSync } from "fs";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
ignoreAttributes: false,
attributeNamePrefix: "",
});

const xml = readFileSync("./data/1c/import.xml", "utf8");
const result = parser.parse(xml);

const products =
result.КоммерческаяИнформация
.Каталог
.Товары
.Товар;

console.log("Тип:", Array.isArray(products));
console.log("Количество:", products.length);
console.log(products[0]);