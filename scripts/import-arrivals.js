// «Новые поступления» from 1С → «ProductArrival» (the last 12 days, rebuilt every run): after each exchange
// (scripts/sync-all.js) and every 30 minutes (lib/arrivalsSync.ts). Unposted / deleted documents disappear.
import { PrismaClient } from "@prisma/client";
import { odataConfigured } from "./onec-odata.js";
import { fetchArrivals } from "./onec-arrivals.js";
import { moscowLocal } from "./onec-orders.js";

const prisma = new PrismaClient();
const KEEP_DAYS = 12; // a little more than shown (10), so the edge of the period is complete

async function main() {
  if (!odataConfigured()) {
    console.log("Поступления: OData не настроен — пропуск");
    return;
  }
  const sinceDate = new Date(Date.now() - KEEP_DAYS * 86400_000);
  const since = moscowLocal(sinceDate).slice(0, 10) + "T00:00:00";
  const { rows, receipts, transfers } = await fetchArrivals(since);
  const site = new Set((await prisma.product.findMany({ where: { guid: { in: [...new Set(rows.map((r) => r.productGuid))] } }, select: { guid: true } })).map((p) => p.guid));
  const data = rows.filter((r) => site.has(r.productGuid));
  await prisma.$transaction([prisma.productArrival.deleteMany({}), prisma.productArrival.createMany({ data, skipDuplicates: true })]);
  const isNew = new Set(data.filter((r) => r.firstReceiptAt && r.firstReceiptAt >= new Date(Date.now() - 10 * 86400_000)).map((r) => r.productGuid)).size;
  console.log(`Поступления с ${since.slice(0, 10)}: приходов ${receipts}, перемещений на Мегу ${transfers}, строк ${data.length} (товаров не на сайте: ${rows.length - data.length}), новинок ${isNew}`);
}

main()
  .catch((e) => {
    console.error("Поступления:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
