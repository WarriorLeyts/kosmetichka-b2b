import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Background jobs of the admin panel (big photo imports): stored in CmsJob, run by one worker inside
 * the site process (instrumentation.ts). A job is leased (lockedUntil) while it runs; if the process
 * restarts, the job is picked up again and continues from where it stopped (handlers keep per-item
 * results). After MAX_ATTEMPTS restarts a job is marked failed.
 */
export const MAX_ATTEMPTS = 3;
const LEASE_MS = 3 * 60_000;

export type JobContext = {
  id: number;
  payload: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  /** save progress (and extend the lease) */
  progress: (p: { done?: number; failed?: number; total?: number; result?: unknown; errors?: unknown }) => Promise<void>;
  /** the job was cancelled from the panel */
  cancelled: () => Promise<boolean>;
};

type Handler = (ctx: JobContext) => Promise<{ result?: unknown }>;
const handlers = new Map<string, Handler>();

export function registerJobHandler(type: string, h: Handler) {
  handlers.set(type, h);
}

export async function enqueueJob(type: string, title: string, payload: unknown, user: { id: number; name: string }) {
  const job = await prisma.cmsJob.create({
    data: { type, title, payload: payload as Prisma.InputJsonValue, createdBy: user.name, userId: user.id },
  });
  // the worker (instrumentation.ts) picks it up within a few seconds; API routes don't run jobs themselves
  // (their module copy has no handlers registered)
  return job;
}

/** take the oldest queued job (or a running one whose lease ran out) — one worker at a time */
async function claim(): Promise<{ id: number; type: string; payload: Prisma.JsonValue; result: Prisma.JsonValue | null; attempts: number } | null> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    UPDATE "CmsJob" SET status = 'running', attempts = attempts + 1, "lockedUntil" = NOW() + INTERVAL '3 minutes',
      "startedAt" = COALESCE("startedAt", NOW())
    WHERE id = (
      SELECT id FROM "CmsJob"
      WHERE status = 'queued' OR (status = 'running' AND "lockedUntil" < NOW())
      ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (!rows.length) return null;
  return prisma.cmsJob.findUnique({ where: { id: rows[0].id }, select: { id: true, type: true, payload: true, result: true, attempts: true } });
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = await claim();
      if (!job) break;
      await run(job);
    }
  } catch (e) {
    console.error("[cms-jobs] worker", e);
  } finally {
    running = false;
  }
}

async function run(job: { id: number; type: string; payload: Prisma.JsonValue; result: Prisma.JsonValue | null; attempts: number }) {
  const h = handlers.get(job.type);
  if (!h) {
    await prisma.cmsJob.update({ where: { id: job.id }, data: { status: "failed", finishedAt: new Date(), errors: [{ error: `Неизвестный тип задачи ${job.type}` }] } });
    return;
  }
  if (job.attempts > MAX_ATTEMPTS) {
    await prisma.cmsJob.update({ where: { id: job.id }, data: { status: "failed", finishedAt: new Date(), lockedUntil: null } });
    return;
  }
  const ctx: JobContext = {
    id: job.id,
    payload: job.payload,
    result: job.result,
    progress: async (p) => {
      await prisma.cmsJob.update({
        where: { id: job.id },
        data: {
          ...(p.done !== undefined ? { done: p.done } : {}),
          ...(p.failed !== undefined ? { failed: p.failed } : {}),
          ...(p.total !== undefined ? { total: p.total } : {}),
          ...(p.result !== undefined ? { result: p.result as Prisma.InputJsonValue } : {}),
          ...(p.errors !== undefined ? { errors: p.errors as Prisma.InputJsonValue } : {}),
          lockedUntil: new Date(Date.now() + LEASE_MS),
        },
      });
    },
    cancelled: async () => (await prisma.cmsJob.findUnique({ where: { id: job.id }, select: { status: true } }))?.status === "cancelled",
  };
  try {
    const out = await h(ctx);
    const cur = await prisma.cmsJob.findUnique({ where: { id: job.id }, select: { status: true } });
    if (cur?.status === "cancelled") return;
    await prisma.cmsJob.update({
      where: { id: job.id },
      data: { status: "done", finishedAt: new Date(), lockedUntil: null, ...(out.result !== undefined ? { result: out.result as Prisma.InputJsonValue } : {}) },
    });
  } catch (e) {
    console.error(`[cms-jobs] job ${job.id}`, e);
    const last = job.attempts >= MAX_ATTEMPTS;
    // не последняя попытка — вернём в очередь (продолжит с места остановки)
    await prisma.cmsJob.update({
      where: { id: job.id },
      data: last
        ? { status: "failed", finishedAt: new Date(), lockedUntil: null, errors: [{ error: e instanceof Error ? e.message : String(e) }] }
        : { status: "queued", lockedUntil: null },
    });
  }
}

export function startCmsJobWorker(everyMs = 3000) {
  if (timer) return;
  timer = setInterval(() => void tick(), everyMs);
  void tick();
}
