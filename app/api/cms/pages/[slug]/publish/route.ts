import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { invalidateDocs } from "@/lib/cms/docs";
import { docContentSchema, docPath } from "@/lib/cms/docSchema";
import { docFromParams, refreshDocPage } from "@/lib/cms/docAdmin";

type Ctx = { params: Promise<{ slug: string }> };

// POST /api/cms/pages/:slug/publish {action?: "publish" | "unpublish"} — опубликовать черновик / снять с сайта
export async function POST(request: Request, ctx: Ctx) {
  const g = await cmsGuard(request, "pages.publish");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, z.object({ action: z.enum(["publish", "unpublish"]).default("publish") }));
  if (body instanceof NextResponse) return body;
  const d = await docFromParams(ctx.params);
  if ("error" in d) return d.error;
  const who = g.user.name || g.user.login;
  if (body.action === "unpublish") {
    // a built-in page goes back to the site's old text; an added one disappears from the site
    await prisma.sitePage.update({ where: { id: d.page.id }, data: { published: Prisma.DbNull, publishedAt: null, publishedBy: null } });
    invalidateDocs();
    refreshDocPage(d.slug);
    await logAction(g.user, g.ip, { action: "page.unpublish", entity: "page", entityId: d.page.key, summary: `Страница ${docPath(d.slug)} снята с публикации`, before: d.page.published });
    return NextResponse.json({ ok: true });
  }
  const parsed = docContentSchema.safeParse(d.page.draft);
  if (!parsed.success) return NextResponse.json({ error: "Черновик с ошибками: " + parsed.error.issues[0]?.message }, { status: 400 });
  const content = parsed.data as unknown as Prisma.InputJsonValue;
  const [updated] = await prisma.$transaction([
    prisma.sitePage.update({ where: { id: d.page.id }, data: { published: content, publishedAt: new Date(), publishedBy: who } }),
    prisma.sitePageVersion.create({ data: { pageId: d.page.id, content, createdBy: who } }),
  ]);
  invalidateDocs();
  refreshDocPage(d.slug);
  await logAction(g.user, g.ip, {
    action: "page.publish",
    entity: "page",
    entityId: d.page.key,
    summary: `«${parsed.data.title}» опубликована (${docPath(d.slug)})`,
    before: d.page.published,
    after: parsed.data,
  });
  return NextResponse.json({ ok: true, publishedAt: updated.publishedAt, publishedBy: updated.publishedBy });
}
