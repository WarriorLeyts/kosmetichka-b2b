// Next.js instrumentation hook: register() runs once per server instance before it serves requests.
export async function register() {
  // The MAXMA queue worker (lib/maxmaQueue.ts) uses Prisma and timers: Node.js runtime only.
  // MAXMA_QUEUE_WORKER=off disables it (e.g. when several instances run and one worker is enough;
  // running it on several instances is safe anyway: tasks are leased).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MAXMA_QUEUE_WORKER !== "off") {
    const { startMaxmaQueueWorker } = await import("./lib/maxmaQueue");
    startMaxmaQueueWorker(60_000);
  }
}
