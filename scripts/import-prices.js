import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";

const prisma = new PrismaClient();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePriceType(name) {
  const value = String(name || "").toLowerCase();

  if (value.includes("круп")) return "big_wholesale";
  if (value.includes("опт")) return "wholesale";
  if (value.includes("скид")) return "discount";
  if (value.includes("роз")) return "retail";

  return value;
}

async function main() {
  const xml = fs.readFileSync("./data/1c/offers.xml", "utf8");
  const data = parser.parse(xml);

  const packageData = data.КоммерческаяИнформация.ПакетПредложений;

  const priceTypes = toArray(packageData.ТипыЦен?.ТипЦены);
  const offers = toArray(packageData.Предложения?.Предложение);

  const priceTypeMap = new Map();

  for (const type of priceTypes) {
    priceTypeMap.set(type.Ид, normalizePriceType(type.Наименование));
  }

  console.log("Предложений найдено:", offers.length);

  for (const offer of offers) {
    const productGuid = offer.Ид;

    const product = await prisma.product.findUnique({
      where: { guid: productGuid },
    });

    if (!product) continue;

    const prices = toArray(offer.Цены?.Цена);

    for (const item of prices) {
      const priceType = priceTypeMap.get(item.ИдТипаЦены);
      if (!priceType) continue;

      await prisma.productPrice.upsert({
        where: {
          productGuid_priceType: {
            productGuid,
            priceType,
          },
        },
        update: {
          price: Number(item.ЦенаЗаЕдиницу || 0),
        },
        create: {
          productGuid,
          priceType,
          price: Number(item.ЦенаЗаЕдиницу || 0),
        },
      });
    }

    const stock = Number(offer.Количество || 0);

    await prisma.product.update({
      where: { guid: productGuid },
      data: { stock },
    });
  }

  console.log("Импорт цен и остатков завершен");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });