import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { getHomePage, HOME_KEY, readContent } from "@/lib/cms/home";
import { invalidateHome } from "@/lib/cms/homeCache";

const schema = z.object({ action: z.enum(["draft", "publish"]) });

// POST /api/cms/home/versions/:id {action} — «draft»: открыть версию в черновике; «publish»: откатить сайт на неё
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(request, schema);
  if (body instanceof NextResponse) return body;
  const g = await cmsGuard(request, body.action === "publish" ? "home.publish" : "home.edit");
  if (isGuardError(g)) return g;
  const id = Number((await params).id);
  const page = await getHomePage();
  const v = Number.isInteger(id) ? await prisma.sitePageVersion.findFirst({ where: { id, pageId: page.id } }) : null;
  if (!v) return NextResponse.json({ error: "Версия не найдена" }, { status: 404 });
  const content = readContent(v.content) as unknown as Prisma.InputJsonValue;
  const who = g.user.name || g.user.login;
  const when = v.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  if (body.action === "draft") {
    await prisma.sitePage.update({ where: { key: HOME_KEY }, data: { draft: content, draftUpdatedAt: new Date(), draftUpdatedBy: who } });
    await logAction(g.user, g.ip, { action: "home.draft", entity: "page", entityId: HOME_KEY, summary: `Главная: в черновик загружена версия от ${when}` });
  } else {
    await prisma.$transaction([
      prisma.sitePage.update({ where: { key: HOME_KEY }, data: { draft: content, draftUpdatedAt: new Date(), draftUpdatedBy: who, published: content, publishedAt: new Date(), publishedBy: who } }),
      prisma.sitePageVersion.create({ data: { pageId: page.id, content, note: `Откат к версии от ${when}`, createdBy: who } }),
    ]);
    invalidateHome();
    await logAction(g.user, g.ip, { action: "home.rollback", entity: "page", entityId: HOME_KEY, summary: `Главная: откат к версии от ${when}`, before: page.published, after: v.content });
  }
  return NextResponse.json({ ok: true });
}
