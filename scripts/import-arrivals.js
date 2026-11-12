// «Новые поступления» from 1С → «ProductArrival» (the longer of the two periods + 2 days, rebuilt every run): after each exchange
// (scripts/sync-all.js) and every 30 minutes (lib/arrivalsSync.ts). Unposted / deleted documents disappear.
import { PrismaClient } from "@prisma/client";
import { odataConfigured } from "./onec-odata.js";
import { fetchArrivals } from "./onec-arrivals.js";
import { moscowLocal } from "./onec-orders.js";

const prisma = new PrismaClient();
/** the periods of «Новинка» / «Снова в наличии» set in the admin panel (CmsSetting «arrivals», lib/arrivalSettings.ts) */
async function periods() {
  const row = await prisma.cmsSetting.findUnique({ where: { key: "arrivals" } }).catch(() => null);
  const v = row?.value && typeof row.value === "object" ? row.value : {};
  const days = (x) => (Number.isFinite(Number(x)) ? Math.min(60, Math.max(1, Math.round(Number(x)))) : 10);
  return { newDays: days(v.newDays), backDays: days(v.backDays) };
}

async function main() {
  if (!odataConfigured()) {
    console.log("Поступления: OData не настроен — пропуск");
    return;
  }
  const { newDays, backDays } = await periods();
  // a little more than the longer period, so the edge of it is complete
  const sinceDate = new Date(Date.now() - (Math.max(newDays, backDays) + 2) * 86400_000);
  const since = moscowLocal(sinceDate).slice(0, 10) + "T00:00:00";
  const { rows, receipts, transfers } = await fetchArrivals(since);
  const site = new Set((await prisma.product.findMany({ where: { guid: { in: [...new Set(rows.map((r) => r.productGuid))] } }, select: { guid: true } })).map((p) => p.guid));
  const data = rows.filter((r) => site.has(r.productGuid));
  await prisma.$transaction([prisma.productArrival.deleteMany({}), prisma.productArrival.createMany({ data, skipDuplicates: true })]);
  const isNew = new Set(data.filter((r) => r.firstReceiptAt && r.firstReceiptAt >= new Date(Date.now() - newDays * 86400_000)).map((r) => r.productGuid)).size;
  console.log(`Поступления с ${since.slice(0, 10)}: приходов ${receipts}, перемещений на Мегу ${transfers}, строк ${data.length} (товаров не на сайте: ${rows.length - data.length}), новинок ${isNew}`);
}

main()
  .catch((e) => {
    console.error("Поступления:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
