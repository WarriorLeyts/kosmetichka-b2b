import { prisma } from "@/lib/prisma";
import { MAXMA_ORDER_WHERE, onOrderStatus } from "@/lib/maxmaOrders";
import { notifyOrderStatus } from "@/lib/notify";
import { buildOrderBody, createOrderDoc, findOrderDoc, loadOrder, orderNumber, prepareOrder, stockOrderNumber } from "../scripts/onec-orders.js";
import { SHOP_WAREHOUSE, STOCK_WAREHOUSE, orderSplits, splitsWarehouses } from "@/lib/orderWarehouses";

/**
 * Site orders → «Заказ покупателя» in 1С over OData, right when the order becomes «Заказ оформлен» (payment).
 * ORDERS_TO_1C=odata (+ ODATA_* in .env) turns it on — and turns off the old way (1С fetching orders by the
 * standard exchange / sync-1c.ps1), so an order can't come to 1С twice. The document is created unposted,
 * the same as the 1С integration made it (scripts/onec-orders.js). After that the order is «Выгружен в 1С».
 */
const READY = ["payment", "approved"];
const CLAIM_STALE_MS = 10 * 60_000;
const RETRY_MS = 15 * 60_000;

export function ordersViaOData(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORDERS_TO_1C === "odata" && Boolean(env.ODATA_BASE_URL && env.ODATA_USER && env.ODATA_PASSWORD);
}

/** «exported» + oneCExportedAt, customer notification, MAXMA confirm — what the 1С ack did. */
export async function markExported(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const toConfirm = await prisma.order.findMany({ where: { id: { in: ids }, oneCExportedAt: null, ...MAXMA_ORDER_WHERE }, select: { id: true } });
  const moved = await prisma.order.findMany({ where: { id: { in: ids }, oneCExportedAt: null }, select: { id: true } });
  await prisma.order.updateMany({ where: { id: { in: ids }, oneCExportedAt: null }, data: { status: "exported", oneCExportedAt: new Date() } });
  if (moved.length) void notifyOrderStatus(moved.map((o) => o.id), "exported");
  if (toConfirm.length) await onOrderStatus(toConfirm.map((o) => o.id), "exported", { background: true });
}

type Outcome = "created" | "linked" | "problem" | "error" | "skipped";

/** One order. Never throws: the error goes to Order.oneCError and the order is tried again later. */
export async function sendOrderTo1C(id: number): Promise<Outcome> {
  if (!ordersViaOData()) return "skipped";
  const now = new Date();
  // claim: only one sender per order (worker, status change, another instance)
  const claimed = await prisma.order.updateMany({
    where: {
      id,
      status: { in: READY },
      oneCExportedAt: null,
      OR: [{ oneCSendingAt: null }, { oneCSendingAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } }],
    },
    data: { oneCSendingAt: now },
  });
  if (!claimed.count) return "skipped";
  try {
    const order = await loadOrder(prisma, id);
    if (!order) return "skipped";
    // wholesale: two documents — the shop's part and the warehouse's part (lib/orderWarehouses.ts)
    if (splitsWarehouses(order.customer?.priceType)) return await sendSplitOrder(id, order);
    const number = orderNumber(id);
    // already in 1С (an earlier try whose answer was lost, or the old exchange) — just link it
    let doc = await findOrderDoc(number, order.createdAt);
    let outcome: Outcome = "linked";
    if (!doc) {
      const { body, problems, counterpartyRef } = await prepareOrder(order, process.env, { createMissingContract: true, fillAccounts: true });
      if (problems.length) {
        await prisma.order.update({
          where: { id },
          data: { oneCError: problems.join("\n"), oneCNextTryAt: new Date(Date.now() + RETRY_MS), oneCSendingAt: null },
        });
        console.warn(`[1c-orders] №${id} не отправлен: ${problems.join("; ")}`);
        return "problem";
      }
      doc = await findOrderDoc(number, order.createdAt, counterpartyRef);
      if (!doc) {
        doc = await createOrderDoc(body);
        outcome = "created";
      }
    }
    await prisma.order.update({
      where: { id },
      data: { oneCRef: doc.Ref_Key, oneCNumber: String(doc.Number || number).trim(), oneCError: null, oneCNextTryAt: null, oneCSendingAt: null },
    });
    await markExported([id]);
    console.log(`[1c-orders] №${id} → 1С ${String(doc.Number || number).trim()} (${outcome === "created" ? "создан" : "уже был"})`);
    return outcome;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const uncertain = Boolean((e as { uncertain?: boolean })?.uncertain);
    console.error(`[1c-orders] №${id}:`, msg);
    await prisma.order
      .update({
        where: { id },
        data: {
          oneCError: `Ошибка 1С: ${msg}`.slice(0, 2000),
          oneCNextTryAt: new Date(Date.now() + (uncertain ? CLAIM_STALE_MS : 2 * 60_000)),
          // no answer from 1С: the document may exist — keep the claim, the next try (after it goes stale) looks it up first
          ...(uncertain ? {} : { oneCSendingAt: null }),
        },
      })
      .catch(() => {});
    return "error";
  }
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;
type Line = LoadedOrder["items"][number];

/** A part of a line: q of its quantity, money in proportion */
function partOf(it: Line, q: number): Line {
  const f = it.quantity > 0 ? q / it.quantity : 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { ...it, quantity: q, total: r2((Number(it.total) || 0) * f), discount: r2((Number(it.discount) || 0) * f), bonusDiscount: r2((Number(it.bonusDiscount) || 0) * f) };
}

/**
 * A wholesale order → «Заказ покупателя» СА-… from «1. Мега Косметичка» and СК-… from «0. Склад» (each only
 * if it has lines). Each document is looked up by its number first, so a retry never makes a second copy.
 */
async function sendSplitOrder(id: number, order: LoadedOrder): Promise<Outcome> {
  const { problems, ctx } = await prepareOrder(order, process.env, { createMissingContract: true, fillAccounts: true });
  if (problems.length) {
    await prisma.order.update({
      where: { id },
      data: { oneCError: problems.join("\n"), oneCNextTryAt: new Date(Date.now() + RETRY_MS), oneCSendingAt: null },
    });
    console.warn(`[1c-orders] №${id} не отправлен: ${problems.join("; ")}`);
    return "problem";
  }
  const splits = await orderSplits(order.items);
  const lines = (which: "shop" | "stock") =>
    order.items.flatMap((it: Line) => {
      const q = splits.get(it.id)?.[which] ?? (which === "shop" ? it.quantity : 0);
      return q > 0 ? [partOf(it, q)] : [];
    });
  const parts = [
    { lines: lines("shop"), number: orderNumber(id), warehouse: SHOP_WAREHOUSE, field: "shop" as const },
    { lines: lines("stock"), number: stockOrderNumber(id), warehouse: STOCK_WAREHOUSE, field: "stock" as const },
  ].filter((p) => p.lines.length);
  let created = false;
  for (const p of parts) {
    // by the number only: both documents have the same customer and date
    let doc = await findOrderDoc(p.number, order.createdAt);
    if (!doc) {
      const comment = p.field === "stock" ? `Со склада. ${order.comment || ""}`.trim() : order.comment;
      doc = await createOrderDoc(buildOrderBody({ ...order, comment, items: p.lines }, { ...ctx, number: p.number, warehouse: p.warehouse }));
      created = true;
    }
    const num = String(doc.Number || p.number).trim();
    await prisma.order.update({
      where: { id },
      data: p.field === "shop" ? { oneCRef: doc.Ref_Key, oneCNumber: num } : { oneCStockRef: doc.Ref_Key, oneCStockNumber: num },
    });
    console.log(`[1c-orders] №${id} → 1С ${num} (${p.field === "shop" ? "магазин" : "склад"})`);
  }
  await prisma.order.update({ where: { id }, data: { oneCError: null, oneCNextTryAt: null, oneCSendingAt: null } });
  await markExported([id]);
  return created ? "created" : "linked";
}

/** Orders ready for 1С whose time has come. */
export async function sendPendingOrders(): Promise<void> {
  if (!ordersViaOData()) return;
  const rows = await prisma.order.findMany({
    where: { status: { in: READY }, oneCExportedAt: null, OR: [{ oneCNextTryAt: null }, { oneCNextTryAt: { lte: new Date() } }] },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 20,
  });
  for (const r of rows) await sendOrderTo1C(r.id);
}

let started = false;
let busy = false;
export function startOrdersTo1C(): void {
  if (started || !ordersViaOData()) return;
  started = true;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await sendPendingOrders();
    } catch (e) {
      console.error("[1c-orders]", e instanceof Error ? e.message : e);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 20_000);
  setInterval(tick, 60_000).unref?.();
  console.log("[1c-orders] заказы в 1С по OData (сразу при «Заказ оформлен»)");
}

/** Right after the status became «Заказ оформлен» (doesn't wait; the worker would pick it up within a minute anyway). */
export function kickOrderTo1C(id: number): void {
  if (ordersViaOData()) void sendOrderTo1C(id);
}
