import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { ARRIVAL_LIMITS, ARRIVAL_SETTINGS_KEY, readArrivalSettings, resetArrivalSettingsCache } from "@/lib/arrivalSettings";
import { runArrivalsSync } from "@/lib/arrivalsSync";

const days = z.number().int().min(ARRIVAL_LIMITS.min, `Не меньше ${ARRIVAL_LIMITS.min} дня`).max(ARRIVAL_LIMITS.max, `Не больше ${ARRIVAL_LIMITS.max} дней`);
const schema = z.object({ newDays: days, backDays: days });

// GET / PUT /api/cms/settings/arrivals — сколько дней держатся «Новинка» и «Снова в наличии»
export async function GET(request: Request) {
  const g = await cmsGuard(request, "cms.access");
  if (isGuardError(g)) return g;
  const row = await prisma.cmsSetting.findUnique({ where: { key: ARRIVAL_SETTINGS_KEY } });
  return NextResponse.json({ ...readArrivalSettings(row?.value), updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null });
}

export async function PUT(request: Request) {
  const g = await cmsGuard(request, "settings.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, schema);
  if (body instanceof NextResponse) return body;
  const who = g.user.name || g.user.login;
  const before = await prisma.cmsSetting.findUnique({ where: { key: ARRIVAL_SETTINGS_KEY } });
  const prev = readArrivalSettings(before?.value);
  await prisma.cmsSetting.upsert({
    where: { key: ARRIVAL_SETTINGS_KEY },
    update: { value: body as Prisma.InputJsonValue, updatedBy: who },
    create: { key: ARRIVAL_SETTINGS_KEY, value: body as Prisma.InputJsonValue, updatedBy: who },
  });
  resetArrivalSettingsCache();
  // a longer period needs older documents from 1С — load them now, not at the next half-hour run
  if (Math.max(body.newDays, body.backDays) > Math.max(prev.newDays, prev.backDays) && process.env.ODATA_BASE_URL) runArrivalsSync();
  await logAction(g.user, g.ip, {
    action: "settings.arrivals",
    entity: "setting",
    entityId: ARRIVAL_SETTINGS_KEY,
    summary: `Сроки: «Новинка» ${body.newDays} дн., «Снова в наличии» ${body.backDays} дн.`,
    before: prev,
    after: body,
  });
  return NextResponse.json({ ok: true });
}
