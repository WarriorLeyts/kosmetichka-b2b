import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import nodePath from "path";
// 1C files: DATA_DIR in production (outside the build), otherwise <cwd>/data/1c
const DATA_1C = process.env.DATA_DIR ? nodePath.join(process.env.DATA_DIR, "1c") : nodePath.join(process.cwd(), "data", "1c");

const prisma = new PrismaClient();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

function normalizePhone(value) {
  if (!value) return null;

  // Remove all non-digits, then take first 11 digits
  const digits = String(value).replace(/\D/g, "").slice(0, 11);

  if (digits.length === 11 && digits.startsWith("7")) {
    return "8" + digits.slice(1);
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return digits;
  }

  if (digits.length === 10 && digits.startsWith("9")) {
    return "8" + digits;
  }

  return null;
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

/**
 * Только эти группы 1С («Родитель») попадают на сайт — выгрузка, которую сделали 08.11.2026
 * (6 менеджеров + «Раяна» и «Отдел Продаж»). Контрагенты других групп, которые может прислать
 * другая выгрузка 1С (старые папки), пропускаются. Новая группа → добавить сюда
 * (и менеджера — в MANAGER_GROUPS в lib/staffScope.ts).
 */
const IMPORT_GROUPS = [
  "Ахтаева Инсана",
  "Бимарзаева Раяна",
  "Даудова Радима",
  "Лорсанова Милана",
  "Петька Сагаипова",
  "Сулейманова Сайде",
  "Раяна",
  "Отдел Продаж",
];

async function main() {
  const xml = fs.readFileSync(nodePath.join(DATA_1C, "customers.xml"), "utf8");

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
  const seen = new Set();
  let otherGroups = 0;

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
    // не из наших групп (другая выгрузка, старые папки) — на сайт не берём
    if (!IMPORT_GROUPS.includes(String(manager || "").trim())) {
      otherGroups++;
      continue;
    }

    seen.add(oneCId);
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
  if (otherGroups) console.log("Пропущено (не наши группы 1С):", otherGroups);

  // контрагенты не из наших групп, оставшиеся от прежних выгрузок, — убираем сразу
  {
    const foreign = (await prisma.oneCCustomer.findMany({ where: { OR: [{ manager: null }, { manager: { notIn: IMPORT_GROUPS } }] }, select: { oneCId: true } })).map((x) => x.oneCId);
    if (foreign.length > 0) {
      const unlinked = await prisma.customer.updateMany({ where: { oneCId: { in: foreign } }, data: { oneCId: null, manager: null } });
      const removed = await prisma.oneCCustomer.deleteMany({ where: { oneCId: { in: foreign } } });
      console.log("Удалено (не наши группы 1С):", removed.count, "· клиентов сайта отвязано:", unlinked.count);
    }
  }

  // ── Контрагенты, которых в 1С больше нет (удалены, их группа удалена или помечена на удаление) ──
  // 1С присылает customers.xml из нескольких выгрузок, и они немного разные (контрагент есть в одной и
  // нет в другой). Поэтому удаляем только тех, кого НИ ОДНА выгрузка не присылала 3 дня (updatedAt
  // обновляется при каждой встрече в файле). Клиентов сайта, привязанных к ним, отвязываем (ниже по
  // телефону они снова привяжутся, если номер есть у другого контрагента). Защита от битого файла:
  // ничего не удаляем, если в файле подозрительно мало контрагентов.
  const before = await prisma.oneCCustomer.count();
  if (seen.size >= 1000 && seen.size >= before * 0.5) {
    const staleSince = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const gone = (await prisma.oneCCustomer.findMany({ where: { updatedAt: { lt: staleSince } }, select: { oneCId: true } }))
      .map((x) => x.oneCId)
      .filter((id) => !seen.has(id));
    if (gone.length > 0) {
      const unlinked = await prisma.customer.updateMany({ where: { oneCId: { in: gone } }, data: { oneCId: null, manager: null } });
      const removed = await prisma.oneCCustomer.deleteMany({ where: { oneCId: { in: gone } } });
      console.log("Удалено (нет в 1С 3 дня):", removed.count, "· клиентов сайта отвязано:", unlinked.count);
    }
  } else {
    console.log(`Удаление пропущено: в файле ${seen.size} контрагентов, на сайте ${before} — файл похож на неполный`);
  }

  // ── Синхронизация таблицы Customer с OneCCustomer по телефону ──────────────
  // Ищем клиентов сайта без привязки к 1С (oneCId = null) и связываем их
  // с записями из 1С по совпадению номера телефона.
  console.log("\nСинхронизация Customer ↔ OneCCustomer по телефону...");

  const oneCCustomers = await prisma.oneCCustomer.findMany({
    where: { phone: { not: null } },
  });

  let linked = 0;
  let priceUpdated = 0;

  for (const oc of oneCCustomers) {
    if (!oc.phone) continue;

    // Ищем клиента сайта с таким же телефоном
    const customer = await prisma.customer.findFirst({
      where: { phone: oc.phone },
    });

    if (!customer) continue;

    const updateData = {};

    // Привязываем oneCId если ещё не привязан
    if (!customer.oneCId) {
      updateData.oneCId = oc.oneCId;
    }

    // Тип цен из 1С — только «Опт» и только при первой привязке к 1С. «Крупный опт» из 1С не берём:
    // крупный опт — то, что клиент выбрал при регистрации или поставил менеджер. Клиент с «Крупным оптом»
    // его сохраняет. Дальше тип меняют на сайте, импорт его не перезаписывает (lib/oneCPriceType.ts).
    if (!customer.oneCId && oc.priceType === "wholesale" && customer.priceType !== "wholesale" && customer.priceType !== "big_wholesale") {
      updateData.priceType = oc.priceType;
      priceUpdated++;
    }

    // Обновляем менеджера из 1С
    if (oc.manager && oc.manager !== customer.manager) {
      updateData.manager = oc.manager;
    }

    // Если клиент был в режиме ожидания (isApproved=false) — автоматически одобряем
    // т.к. он теперь есть в 1С
    if (!customer.isApproved) {
      updateData.isApproved = true;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: updateData,
      });
      linked++;
    }
  }

  // менеджер привязанного клиента — группа его контрагента в 1С (номер телефона мог смениться,
  // и сверка по телефону выше его не находит)
  const withLink = await prisma.customer.findMany({ where: { oneCId: { not: null } }, select: { id: true, oneCId: true, manager: true } });
  const groupOf = new Map((await prisma.oneCCustomer.findMany({ where: { oneCId: { in: withLink.map((c) => c.oneCId) } }, select: { oneCId: true, manager: true } })).map((x) => [x.oneCId, x.manager]));
  let managerFixed = 0;
  for (const c of withLink) {
    const m = groupOf.get(c.oneCId);
    if (m && m !== c.manager) {
      await prisma.customer.update({ where: { id: c.id }, data: { manager: m } });
      managerFixed++;
    }
  }
  console.log("Клиентов сайта привязано/обновлено:", linked);
  console.log("Менеджер исправлен по группе в 1С у:", managerFixed);
  console.log("Тип цен обновлён у:", priceUpdated);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });