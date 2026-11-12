import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";

type Ctx = { params: Promise<{ id: string }> };
const load = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? prisma.cmsJob.findUnique({ where: { id } }) : null;
};

// GET /api/cms/jobs/:id — ход задачи, ошибки
export async function GET(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const job = await load(ctx);
  if (!job) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  const { payload, result, ...rest } = job; // eslint-disable-line @typescript-eslint/no-unused-vars
  const items = (result as { items?: Record<string, { s: string }> } | null)?.items ?? {};
  const counts = Object.values(items).reduce<Record<string, number>>((m, x) => ((m[x.s] = (m[x.s] ?? 0) + 1), m), {});
  return NextResponse.json({ job: { ...rest, counts, errors: ((job.errors as unknown[] | null) ?? []).slice(-200) } });
}

// POST /api/cms/jobs/:id {action} — «cancel»: остановить; «retry»: ещё раз обработать товары с ошибками
export async function POST(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, z.object({ action: z.enum(["cancel", "retry"]) }));
  if (body instanceof NextResponse) return body;
  const job = await load(ctx);
  if (!job) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  if (body.action === "cancel") {
    if (!["queued", "running"].includes(job.status)) return NextResponse.json({ error: "Задача уже закончилась" }, { status: 409 });
    await prisma.cmsJob.update({ where: { id: job.id }, data: { status: "cancelled", finishedAt: new Date(), lockedUntil: null } });
    await logAction(g.user, g.ip, { action: "job.cancel", entity: "job", entityId: job.id, summary: `Остановлена задача «${job.title}»` });
  } else {
    if (["queued", "running"].includes(job.status)) return NextResponse.json({ error: "Задача ещё идёт" }, { status: 409 });
    const result = (job.result as { items?: Record<string, { s: string }> } | null) ?? {};
    const items = Object.fromEntries(Object.entries(result.items ?? {}).filter(([, v]) => v.s !== "error"));
    await prisma.cmsJob.update({
      where: { id: job.id },
      data: { status: "queued", attempts: 0, finishedAt: null, lockedUntil: null, result: { ...result, items } as Prisma.InputJsonValue },
    });
    await logAction(g.user, g.ip, { action: "job.retry", entity: "job", entityId: job.id, summary: `Повтор ошибок задачи «${job.title}»` });
  }
  return NextResponse.json({ ok: true });
}
