import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";

const prisma = new PrismaClient();

const BRAND_PROPERTY_ID = "bd42a1bd-7e0a-11ee-adf4-a8a15932577b";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getBrandGuid(product) {
  const properties = toArray(product.ЗначенияСвойств?.ЗначенияСвойства);
  const brandProp = properties.find((p) => p.Ид === BRAND_PROPERTY_ID);
  return brandProp?.Значение || null;
}

function getRequisite(product, names) {
  const requisites = toArray(product.ЗначенияРеквизитов?.ЗначениеРеквизита);

  const found = requisites.find((r) =>
    names.includes(String(r.Наименование || "").trim())
  );

  return found?.Значение || null;
}

async function importCategories(groups, parentGuid = null) {
  for (const group of toArray(groups)) {
    if (!group?.Ид) continue;

    const guid = String(group.Ид);

    await prisma.category.upsert({
      where: { guid },
      update: {
        name: String(group.Наименование || ""),
        parentGuid,
      },
      create: {
        guid,
        name: String(group.Наименование || ""),
        parentGuid,
      },
    });

    if (group.Группы?.Группа) {
      await importCategories(group.Группы.Группа, guid);
    }
  }
}

async function importBrands(classifier) {
  const properties = toArray(classifier.Свойства?.Свойство);

  const brandProperty = properties.find(
    (property) => property.Ид === BRAND_PROPERTY_ID
  );

  const values = toArray(
    brandProperty?.ВариантыЗначений?.Справочник
  );

  console.log("Брендов найдено:", values.length);

  for (const value of values) {
    if (!value?.ИдЗначения) continue;

    await prisma.brand.upsert({
      where: {
        guid: String(value.ИдЗначения),
      },
      update: {
        name: String(value.Значение || ""),
      },
      create: {
        guid: String(value.ИдЗначения),
        name: String(value.Значение || ""),
      },
    });
  }
}

async function main() {
  const xml = fs.readFileSync("./data/1c/import.xml", "utf8");
  const data = parser.parse(xml);

  const info = data.КоммерческаяИнформация;
  const classifier = info.Классификатор;
  const catalog = info.Каталог;

  await importCategories(classifier.Группы?.Группа);
  await importBrands(classifier);

  const products = toArray(catalog.Товары?.Товар);

  console.log("Товаров найдено:", products.length);

  for (const product of products) {
    const categoryGuid =
      product.Категория ||
      product.Группы?.Ид ||
      null;

    const brandGuid = getBrandGuid(product);

    const description =
      (product["Описание"] ? String(product["Описание"]).trim() : null) ||
      getRequisite(product, [
        "Описание",
        "Описание товара",
        "Полное описание",
      ]) ||
      null;

    await prisma.product.upsert({
      where: {
        guid: String(product.Ид),
      },
      update: {
        article: product.Код ? String(product.Код) : null,
        name: String(product.Наименование || ""),
        description,
        barcode: String(product.Штрихкод || ""),
        categoryGuid: categoryGuid ? String(categoryGuid) : null,
        brandGuid: brandGuid ? String(brandGuid) : null,
      },
      create: {
        guid: String(product.Ид),
        article: product.Код ? String(product.Код) : null,
        name: String(product.Наименование || ""),
        description,
        barcode: String(product.Штрихкод || ""),
        categoryGuid: categoryGuid ? String(categoryGuid) : null,
        brandGuid: brandGuid ? String(brandGuid) : null,
      },
    });
  }

  console.log("Импорт категорий, брендов и товаров завершен");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });