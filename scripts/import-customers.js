import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";

const prisma = new PrismaClient();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

function normalizePhone(value) {
  if (!value) return null;

  const digits = String(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("7")) {
    return "8" + digits.slice(1);
  }

  if (digits.length === 10 && digits.startsWith("9")) {
    return "8" + digits;
  }

  return digits || null;
}

function extractPhoneFromName(name) {
  if (!name) return null;

  const match = String(name).match(/(?:\+7|7|8|9)[\d\s()-]{9,}/);

  return normalizePhone(match?.[0]);
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getValue(item, keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null) {
      return String(item[key]).trim();
    }
  }

  return "";
}

function normalizePriceType(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("круп")) return "big_wholesale";
  if (text.includes("опт")) return "wholesale";
  if (text.includes("скид")) return "discount";
  if (text.includes("роз")) return "retail";

  return text || null;
}

async function main() {
  const xml = fs.readFileSync("./data/1c/customers.xml", "utf8");

  const data = parser.parse(xml);

  let customers =
    data?.Контрагенты?.Контрагент ||
    data?.Customers?.Customer ||
    [];

  customers = toArray(customers);

  console.log("Контрагентов найдено:", customers.length);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of customers) {
    const oneCId = getValue(item, ["Ид", "Id", "ID", "oneCId"]);
    const name = getValue(item, ["Наименование", "Name", "name"]);

    const rawPhone = getValue(item, ["Телефон", "Phone", "phone"]);
    const phone = normalizePhone(rawPhone) || extractPhoneFromName(name);

    const manager =
      getValue(item, ["Родитель", "Менеджер", "Manager", "manager"]) || null;

    const rawPriceType = getValue(item, [
      "PriceType",
      "ТипЦен",
      "ТипЦены",
      "priceType",
    ]);

    const priceType = normalizePriceType(rawPriceType);

    if (!oneCId || !name) {
      skipped++;
      continue;
    }

    const exists = await prisma.oneCCustomer.findUnique({
      where: { oneCId },
    });

    await prisma.oneCCustomer.upsert({
      where: { oneCId },
      update: {
        name,
        phone,
        manager,
        priceType,
      },
      create: {
        oneCId,
        name,
        phone,
        manager,
        priceType,
      },
    });

    if (exists) {
      updated++;
    } else {
      created++;
    }
  }

  console.log("Импорт контрагентов завершен");
  console.log("Создано:", created);
  console.log("Обновлено:", updated);
  console.log("Пропущено:", skipped);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });