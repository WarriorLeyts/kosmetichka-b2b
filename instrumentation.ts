// Next.js instrumentation hook: register() runs once per server instance before it serves requests.
export async function register() {
  // The MAXMA queue worker (lib/maxmaQueue.ts) uses Prisma and timers: Node.js runtime only.
  // MAXMA_QUEUE_WORKER=off disables it (e.g. when several instances run and one worker is enough;
  // running it on several instances is safe anyway: tasks are leased).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MAXMA_QUEUE_WORKER !== "off") {
    const { startMaxmaQueueWorker } = await import("./lib/maxmaQueue");
    startMaxmaQueueWorker(60_000);
  }
  // Reminders to customers who haven't confirmed the manager's changes (2 h, 24 h)
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.CONFIRM_REMINDERS !== "off") {
    const { startConfirmReminders } = await import("./lib/orderConfirm");
    startConfirmReminders();
  }
  // «Ходовые позиции» first in the catalogue: sales of the last 90 days, recounted hourly
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SALES_RECOUNT !== "off") {
    const { startSalesRecount } = await import("./lib/productSales");
    startSalesRecount();
  }
  // Counterparties from 1С over OData every 15 min (instead of the «Выгрузка контрагентов сайт» extension)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCustomersSync } = await import("./lib/customersSync");
    startCustomersSync();
  }
  // Site orders → «Заказ покупателя» in 1С over OData (ORDERS_TO_1C=odata)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOrdersTo1C } = await import("./lib/onecOrders");
    startOrdersTo1C();
  }
  // Which linked MAXMA cards give the discount price: owner in the 1С group «Максма Скидка» (every 6 h)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDiscountCards } = await import("./lib/discountCard");
    startDiscountCards();
  }
  // All barcodes from 1С: the full check every hour (after each exchange — the products of the exchange)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBarcodesSync } = await import("./lib/barcodesSync");
    startBarcodesSync();
  }
}

// Uncaught server errors → DATA_DIR/server-errors.log → Telegram via ~/ops/monitor.mjs (audit ARCH-07)
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError, serverErrorLine } = await import("./lib/serverErrors");
  await recordServerError(serverErrorLine(err, request, context));
}
