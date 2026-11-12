import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { readDoc } from "@/lib/cms/docs";
import { docFromParams } from "@/lib/cms/docAdmin";

type Ctx = { params: Promise<{ slug: string }> };

// GET /api/cms/pages/:slug/versions — что публиковали (новые сверху)
export async function GET(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const d = await docFromParams(ctx.params);
  if ("error" in d) return d.error;
  const versions = await prisma.sitePageVersion.findMany({
    where: { pageId: d.page.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, createdBy: true, createdAt: true },
  });
  return NextResponse.json({ versions });
}

// POST /api/cms/pages/:slug/versions {id} — открыть опубликованную раньше версию в черновике
export async function POST(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, z.object({ id: z.number().int().positive() }));
  if (body instanceof NextResponse) return body;
  const d = await docFromParams(ctx.params);
  if ("error" in d) return d.error;
  const v = await prisma.sitePageVersion.findFirst({ where: { id: body.id, pageId: d.page.id } });
  if (!v) return NextResponse.json({ error: "Версия не найдена" }, { status: 404 });
  const who = g.user.name || g.user.login;
  await prisma.sitePage.update({
    where: { id: d.page.id },
    data: { draft: readDoc(v.content, d.slug) as unknown as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedBy: who },
  });
  await logAction(g.user, g.ip, {
    action: "page.draft",
    entity: "page",
    entityId: d.page.key,
    summary: `В черновик загружена версия от ${v.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`,
  });
  return NextResponse.json({ ok: true });
}
