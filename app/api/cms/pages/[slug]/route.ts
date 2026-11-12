import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { invalidateDocs, readDoc } from "@/lib/cms/docs";
import { docContentSchema, docPath, isBuiltinDoc } from "@/lib/cms/docSchema";
import { docFromParams, refreshDocPage } from "@/lib/cms/docAdmin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

// GET /api/cms/pages/:slug — черновик и опубликованная версия
export async function GET(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const d = await docFromParams(ctx.params);
  if ("error" in d) return d.error;
  const { slug, page } = d;
  return NextResponse.json({
    slug,
    path: docPath(slug),
    builtin: isBuiltinDoc(slug),
    draft: readDoc(page.draft, slug),
    published: page.published ? readDoc(page.published, slug) : null,
    draftUpdatedAt: page.draftUpdatedAt,
    draftUpdatedBy: page.draftUpdatedBy,
    publishedAt: page.publishedAt,
    publishedBy: page.publishedBy,
    canPublish: can(g.user, "pages.publish"),
  });
}

const putSchema = z.object({ content: docContentSchema, baseUpdatedAt: z.string().datetime().optional() });

// PUT /api/cms/pages/:slug — сохранить черновик (на сайте ничего не меняется до публикации)
export async function PUT(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, putSchema);
  if (body instanceof NextResponse) return body;
  const d = await docFromParams(ctx.params);
  if ("error" in d) return d.error;
  const who = g.user.name || g.user.login;
  if (body.baseUpdatedAt && d.page.draftUpdatedBy && d.page.draftUpdatedBy !== who && new Date(body.baseUpdatedAt) < d.page.draftUpdatedAt) {
    return NextResponse.json(
      { error: `Черновик уже изменил(а) ${d.page.draftUpdatedBy}. Обновите страницу, чтобы не потерять чужие правки.`, conflict: true },
      { status: 409 }
    );
  }
  const saved = await prisma.sitePage.update({
    where: { id: d.page.id },
    data: { title: body.content.title, draft: body.content as unknown as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedBy: who },
  });
  await logAction(g.user, g.ip, { action: "page.draft", entity: "page", entityId: d.page.key, summary: `«${body.content.title}»: сохранён черновик` });
  return NextResponse.json({ ok: true, draftUpdatedAt: saved.draftUpdatedAt, draftUpdatedBy: saved.draftUpdatedBy });
}

// DELETE /api/cms/pages/:slug — удалить добавленную страницу (встроенные не удаляются)
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "pages.publish");
  if (isGuardError(g)) return g;
  const d = await docFromParams(ctx.params);
  if ("error" in d) return d.error;
  if (isBuiltinDoc(d.slug)) return NextResponse.json({ error: "Эту страницу удалить нельзя — её можно только изменить" }, { status: 400 });
  await prisma.sitePage.delete({ where: { id: d.page.id } });
  invalidateDocs();
  refreshDocPage(d.slug);
  await logAction(g.user, g.ip, { action: "page.delete", entity: "page", entityId: d.page.key, summary: `Страница ${docPath(d.slug)} удалена`, before: d.page.published ?? d.page.draft });
  return NextResponse.json({ ok: true });
}
