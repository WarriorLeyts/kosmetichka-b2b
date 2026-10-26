import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cancelOrder,
  confirmOrder,
  maxmaConfigured,
  MaxmaError,
  setLoyaltyOrderQuery,
  type SetOrderQuery,
} from "@/lib/maxma";

/**
 * Outbox for MAXMA calls made after an order is saved (v2/set-order, confirm-order,
 * cancel-order of «site-<orderId>»). enqueueMaxmaTask() inserts a task and tries it at once;
 * failures are retried by runMaxmaQueue() (every minute, see instrumentation.ts) with backoff
 * 1, 2, 5, 10, 30 min, then hourly; after 48 h of failures a task becomes "failed" (no more
 * automatic retries, POST /api/admin/maxma/retry re-runs it).
 *
 * Tasks of one order run strictly in order (createdAt, id): only the oldest pending task of an
 * order may run, so confirm/cancel never overtake an unsent set-order. A "set" with a newer
 * "set" for the same order is stale and is marked done without calling MAXMA.
 */

export type MaxmaAction = "set" | "confirm" | "cancel";
export type MaxmaTaskStatus = "pending" | "done" | "failed";

const MIN = 60_000;
/** Delay before attempt N+1 after N failed attempts: 1, 2, 5, 10, 30 min, then every 60 min. */
const BACKOFF_MIN = [1, 2, 5, 10, 30];
/** A task failing for longer than this (since createdAt) stops being retried automatically. */
export const MAXMA_GIVE_UP_MS = 48 * 60 * MIN;
/** A task not done this long after createdAt is shown to staff as «не синхронизировано». */
export const MAXMA_STUCK_MS = 60 * MIN;
/** A running task is leased for this long (nextAt moved forward) so parallel workers skip it. */
const LEASE_MS = 2 * MIN;

/** Backoff after `attempts` failed attempts (1-based). */
export function maxmaBackoffMs(attempts: number): number {
  const i = Math.max(1, Math.floor(attempts)) - 1;
  return (i < BACKOFF_MIN.length ? BACKOFF_MIN[i] : 60) * MIN;
}

/** Task fields after a failed attempt. */
export function failureUpdate(task: { attempts: number; createdAt: Date }, error: string, now: Date) {
  const attempts = task.attempts + 1;
  const giveUp = now.getTime() - task.createdAt.getTime() >= MAXMA_GIVE_UP_MS;
  return {
    attempts,
    lastError: error.slice(0, 1000),
    status: (giveUp ? "failed" : "pending") as MaxmaTaskStatus,
    nextAt: new Date(now.getTime() + maxmaBackoffMs(attempts)),
  };
}

export type QueueTask = { id: number; orderId: number; action: string; nextAt: Date; createdAt: Date };

const byQueueOrder = (a: QueueTask, b: QueueTask) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

/**
 * What to do with one order's pending tasks: `skip` — stale "set"s (a newer "set" exists,
 * `latestSetId` = id of the newest "set" of the order in any status), `run` — the oldest
 * remaining task if it is due, otherwise null (an older task waits for its retry, so the
 * newer ones wait too).
 */
export function planOrderTasks(pending: QueueTask[], latestSetId: number | null, now: Date): { skip: number[]; run: QueueTask | null } {
  const skip: number[] = [];
  for (const t of [...pending].sort(byQueueOrder)) {
    if (t.action === "set" && latestSetId != null && latestSetId > t.id) {
      skip.push(t.id);
      continue;
    }
    return { skip, run: t.nextAt.getTime() <= now.getTime() ? t : null };
  }
  return { skip, run: null };
}

function errorText(e: unknown): string {
  if (e instanceof MaxmaError) return e.detail || e.message;
  return e instanceof Error ? e.message : String(e);
}

/** Calls MAXMA for one task; throws on failure. */
async function execute(task: { orderId: number; action: string; payload: Prisma.JsonValue | null }): Promise<void> {
  const id = task.orderId;
  if (task.action === "set") {
    const query = task.payload as unknown as SetOrderQuery | null;
    if (!query || !Array.isArray(query.rows)) throw new Error("set: нет calculationQuery в задаче");
    const r = await setLoyaltyOrderQuery(id, query);
    const want = Math.max(0, Math.floor(Number(query.applyBonuses) || 0));
    if (want > 0 && r.applied !== want) {
      // The order spends `want`, MAXMA reserved another amount: staff must look at it
      throw new Error(`MAXMA зарезервировала ${r.applied} бонусов вместо ${want}`);
    }
    console.log(`[maxma] set-order site-${id} ok (bonuses −${r.applied} +${r.collected}${r.anonymous ? ", anonymous" : ""})`);
    return;
  }
  if (task.action === "confirm") {
    await confirmOrder(id);
    console.log(`[maxma] confirm-order site-${id} ok`);
    return;
  }
  if (task.action === "cancel") {
    try {
      await cancelOrder(id);
      console.log(`[maxma] cancel-order site-${id} ok`);
    } catch (e) {
      // Never registered (e.g. set-order failed before the order was rolled back): nothing to release
      if (e instanceof MaxmaError && e.notFound) {
        console.log(`[maxma] cancel-order site-${id}: not found in MAXMA, nothing to cancel`);
        return;
      }
      throw e;
    }
    return;
  }
  throw new Error(`неизвестное действие ${task.action}`);
}

export type RunStats = { ran: number; ok: number; failed: number; skipped: number };

/**
 * Runs the due tasks of one order in order (at most `maxSteps`), stopping at the first failure
 * or at a task that is not due yet. Never throws.
 */
export async function runOrderMaxmaTasks(orderId: number, maxSteps = 10, stats: RunStats = { ran: 0, ok: 0, failed: 0, skipped: 0 }): Promise<RunStats> {
  try {
    if (!maxmaConfigured()) return stats;
    for (let step = 0; step < maxSteps; step++) {
      const now = new Date();
      const [pending, latestSet] = await Promise.all([
        prisma.maxmaTask.findMany({
          where: { orderId, status: "pending" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, orderId: true, action: true, nextAt: true, createdAt: true },
        }),
        prisma.maxmaTask.findFirst({ where: { orderId, action: "set" }, orderBy: { id: "desc" }, select: { id: true } }),
      ]);
      const plan = planOrderTasks(pending, latestSet?.id ?? null, now);
      if (plan.skip.length) {
        await prisma.maxmaTask.updateMany({
          where: { id: { in: plan.skip }, status: "pending" },
          data: { status: "done", lastError: "заменено более новым set-order" },
        });
        stats.skipped += plan.skip.length;
      }
      if (!plan.run) break;

      // Lease: only one worker (interval / request / retry button / another instance) runs it
      const claimed = await prisma.maxmaTask.updateMany({
        where: { id: plan.run.id, status: "pending", nextAt: plan.run.nextAt },
        data: { nextAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claimed.count !== 1) break;
      const task = await prisma.maxmaTask.findUnique({ where: { id: plan.run.id } });
      if (!task) break;

      stats.ran++;
      try {
        await execute(task);
        await prisma.maxmaTask.update({
          where: { id: task.id },
          data: { status: "done", attempts: task.attempts + 1, lastError: null, nextAt: new Date() },
        });
        stats.ok++;
      } catch (e) {
        const msg = errorText(e);
        const upd = failureUpdate(task, msg, new Date());
        await prisma.maxmaTask.update({ where: { id: task.id }, data: upd });
        stats.failed++;
        const loud = task.action === "set" && Number((task.payload as { applyBonuses?: unknown } | null)?.applyBonuses) > 0;
        console.error(
          `[maxma] ${loud ? "BONUSES NOT SYNCED: " : ""}${task.action} site-${orderId} failed (attempt ${upd.attempts}` +
            `${upd.status === "failed" ? ", giving up" : `, retry at ${upd.nextAt.toISOString()}`}): ${msg}`
        );
        break;
      }
    }
  } catch (e) {
    console.error(`[maxma] queue for site-${orderId}:`, e);
  }
  return stats;
}

/**
 * Inserts a task (status pending, due now) and tries the order's tasks once right away.
 * Never throws: a failed attempt stays in the queue for the worker. No-op when MAXMA is not configured.
 */
export async function enqueueMaxmaTask(
  orderId: number,
  action: MaxmaAction,
  payload?: SetOrderQuery | null,
  opts: { run?: boolean } = {}
): Promise<void> {
  if (!maxmaConfigured()) return;
  try {
    await prisma.maxmaTask.create({
      data: { orderId, action, ...(payload ? { payload: payload as unknown as Prisma.InputJsonValue } : {}) },
    });
  } catch (e) {
    console.error(`[maxma] could not queue ${action} for site-${orderId}:`, e);
    return;
  }
  if (opts.run !== false) await runOrderMaxmaTasks(orderId);
}

/** Worker: runs due tasks of up to `limit` orders (oldest due first). Never throws. */
export async function runMaxmaQueue(limit = 20): Promise<RunStats> {
  const stats: RunStats = { ran: 0, ok: 0, failed: 0, skipped: 0 };
  try {
    if (!maxmaConfigured()) return stats;
    const due = await prisma.maxmaTask.findMany({
      where: { status: "pending", nextAt: { lte: new Date() } },
      orderBy: [{ nextAt: "asc" }, { id: "asc" }],
      select: { orderId: true },
      take: limit * 5,
    });
    const orderIds = [...new Set(due.map((t) => t.orderId))].slice(0, limit);
    for (const orderId of orderIds) await runOrderMaxmaTasks(orderId, 10, stats);
  } catch (e) {
    console.error("[maxma] queue worker:", e);
  }
  return stats;
}

/** Makes pending / failed tasks (of one order or all) due now: the retry button. */
export async function resetMaxmaTasks(orderId?: number) {
  await prisma.maxmaTask.updateMany({
    where: { ...(orderId ? { orderId } : {}), status: { in: ["pending", "failed"] } },
    data: { status: "pending", nextAt: new Date() },
  });
}

/** Tasks staff should see: failed, or still pending an hour after they were created. */
export function maxmaStuckWhere(now = new Date()): Prisma.MaxmaTaskWhereInput {
  return {
    OR: [{ status: "failed" }, { status: "pending", createdAt: { lt: new Date(now.getTime() - MAXMA_STUCK_MS) } }],
  };
}

export type MaxmaStuck = { action: string; attempts: number; lastError: string | null; status: string; createdAt: string };

/** Oldest stuck task per order (orders without stuck tasks are absent). Never throws (DB error → empty). */
export async function maxmaStuckByOrder(orderIds: number[]): Promise<Map<number, MaxmaStuck>> {
  const map = new Map<number, MaxmaStuck>();
  if (orderIds.length === 0) return map;
  let rows;
  try {
    rows = await prisma.maxmaTask.findMany({
      where: { orderId: { in: orderIds }, ...maxmaStuckWhere() },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  } catch (e) {
    console.error("[maxma] stuck tasks lookup failed:", e instanceof Error ? e.message : e);
    return map;
  }
  for (const t of rows) {
    if (!map.has(t.orderId)) {
      map.set(t.orderId, {
        action: t.action,
        attempts: t.attempts,
        lastError: t.lastError,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      });
    }
  }
  return map;
}

/** Ids of existing orders with stuck tasks (for the admin badge / ?maxma=stuck filter). Never throws. */
export async function maxmaStuckOrderIds(): Promise<number[]> {
  try {
    const rows = await prisma.maxmaTask.findMany({ where: maxmaStuckWhere(), select: { orderId: true }, distinct: ["orderId"] });
    if (rows.length === 0) return [];
    const existing = await prisma.order.findMany({ where: { id: { in: rows.map((r) => r.orderId) } }, select: { id: true } });
    return existing.map((o) => o.id);
  } catch (e) {
    console.error("[maxma] stuck orders lookup failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** «set-order» / «confirm-order» / «cancel-order» for staff messages. */
export function maxmaActionLabel(action: string): string {
  return action === "set" ? "регистрация заказа (set-order)" : action === "confirm" ? "подтверждение (confirm-order)" : action === "cancel" ? "отмена (cancel-order)" : action;
}

const g = globalThis as unknown as { __maxmaQueueTimer?: ReturnType<typeof setInterval>; __maxmaQueueBusy?: boolean };

/** Starts the once-a-minute worker (idempotent per process; called from instrumentation.ts). */
export function startMaxmaQueueWorker(intervalMs = 60_000) {
  if (g.__maxmaQueueTimer) return;
  g.__maxmaQueueTimer = setInterval(async () => {
    if (g.__maxmaQueueBusy) return;
    g.__maxmaQueueBusy = true;
    try {
      const s = await runMaxmaQueue();
      if (s.ran > 0 || s.skipped > 0) console.log(`[maxma] queue: ran ${s.ran}, ok ${s.ok}, failed ${s.failed}, skipped ${s.skipped}`);
    } finally {
      g.__maxmaQueueBusy = false;
    }
  }, intervalMs);
  g.__maxmaQueueTimer.unref?.();
  console.log("[maxma] queue worker started");
}
