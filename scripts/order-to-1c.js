// Check how a site order would go to 1С over OData, WITHOUT writing anything:
//   node scripts/order-to-1c.js 209
// Prints the problems (if any) and, when 1С already has СА-000209, the difference from it.
import { PrismaClient } from "@prisma/client";
import { odataGet } from "./onec-odata.js";
import { findOrderDoc, orderNumber, prepareOrder } from "./onec-orders.js";
import { cmlComment } from "./onec-order-comment.js";

const prisma = new PrismaClient();

export async function loadOrder(db, id) {
  const o = await db.order.findUnique({ where: { id }, include: { customer: true, items: { orderBy: { id: "asc" } } } });
  if (!o) return null;
  const guids = new Map((await db.product.findMany({ where: { id: { in: o.items.map((i) => i.productId) } }, select: { id: true, guid: true } })).map((p) => [p.id, p.guid]));
  return {
    id: o.id,
    createdAt: o.createdAt,
    comment: cmlComment(o),
    customer: o.customer,
    items: o.items.map((i) => ({ ...i, guid: guids.get(i.productId) })),
  };
}

async function main() {
  const id = Number(process.argv[2]);
  const order = await loadOrder(prisma, id);
  if (!order) throw new Error(`Заказа ${id} нет`);
  const { body, problems } = await prepareOrder(order);
  console.log("Проблемы:", problems.length ? problems : "нет");
  const ex = await findOrderDoc(orderNumber(id), order.createdAt);
  if (!ex) {
    console.log("В 1С документа", orderNumber(id), "нет. Тело:", JSON.stringify({ ...body, Запасы: body.Запасы.slice(0, 2) }, null, 1));
    return;
  }
  const doc = await odataGet(`Document_ЗаказПокупателя(guid'${ex.Ref_Key}')`);
  const d = Array.isArray(doc) ? doc[0] : doc;
  const diff = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === "Запасы" || k === "ИнформацияПоКонтрагенту") continue;
    if (JSON.stringify(v) !== JSON.stringify(d[k])) diff.push(`${k}: наш ${JSON.stringify(v)} | 1С ${JSON.stringify(d[k])}`);
  }
  const lines = d.Запасы || [];
  if (lines.length !== body.Запасы.length) diff.push(`строк: наш ${body.Запасы.length} | 1С ${lines.length}`);
  body.Запасы.forEach((r, i) => {
    const l = lines[i] || {};
    for (const [k, v] of Object.entries(r)) if (JSON.stringify(v) !== JSON.stringify(l[k])) diff.push(`стр.${i + 1} ${k}: наш ${JSON.stringify(v)} | 1С ${JSON.stringify(l[k])}`);
  });
  const ik = JSON.stringify(body.ИнформацияПоКонтрагенту.map((x) => [x.Вид, x.Представление]));
  const id1 = JSON.stringify((d.ИнформацияПоКонтрагенту || []).map((x) => [x.Вид, x.Представление]));
  if (ik !== id1) diff.push(`ИнформацияПоКонтрагенту: наш ${ik} | 1С ${id1}`);
  console.log(`${orderNumber(id)} в 1С (${d.Posted ? "проведён" : "не проведён"}). Отличий: ${diff.length}`);
  for (const x of diff.slice(0, 40)) console.log("  " + x);
}

if (process.argv[1] && process.argv[1].endsWith("order-to-1c.js")) {
  main()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
