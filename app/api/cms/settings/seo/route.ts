import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { DEFAULT_TEMPLATES, unknownVars } from "@/lib/cms/seoTemplate";

const KEY = "seo.templates";
const schema = z.object({ title: z.string().trim().max(200), description: z.string().trim().max(400), shortDescription: z.string().trim().max(1000) });

// GET / PUT /api/cms/settings/seo — шаблоны SEO и краткого описания
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const row = await prisma.cmsSetting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ templates: { ...DEFAULT_TEMPLATES, ...((row?.value as object) ?? {}) }, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null });
}

export async function PUT(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, schema);
  if (body instanceof NextResponse) return body;
  const bad = [...unknownVars(body.title), ...unknownVars(body.description), ...unknownVars(body.shortDescription)];
  if (bad.length) return NextResponse.json({ error: `Неизвестные переменные: ${bad.map((b) => `{${b}}`).join(", ")}` }, { status: 400 });
  const who = g.user.name || g.user.login;
  await prisma.cmsSetting.upsert({ where: { key: KEY }, update: { value: body as Prisma.InputJsonValue, updatedBy: who }, create: { key: KEY, value: body as Prisma.InputJsonValue, updatedBy: who } });
  await logAction(g.user, g.ip, { action: "settings.seo", entity: "setting", entityId: KEY, summary: "Изменены шаблоны SEO", after: body });
  return NextResponse.json({ ok: true });
}
