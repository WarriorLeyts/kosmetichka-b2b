import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { getHomePage, HOME_KEY, readContent } from "@/lib/cms/home";
import { pageContentSchema } from "@/lib/cms/homeSchema";

export const dynamic = "force-dynamic";

// GET /api/cms/home — черновик и опубликованная версия главной
export async function GET(request: Request) {
  const g = await cmsGuard(request, "home.edit");
  if (isGuardError(g)) return g;
  const page = await getHomePage();
  return NextResponse.json({
    draft: readContent(page.draft),
    published: page.published ? readContent(page.published) : null,
    draftUpdatedAt: page.draftUpdatedAt,
    draftUpdatedBy: page.draftUpdatedBy,
    publishedAt: page.publishedAt,
    publishedBy: page.publishedBy,
    canPublish: can(g.user, "home.publish"),
  });
}

const putSchema = z.object({ content: pageContentSchema, baseUpdatedAt: z.string().datetime().optional() });

// PUT /api/cms/home — сохранить черновик (на сайте ничего не меняется до публикации)
export async function PUT(request: Request) {
  const g = await cmsGuard(request, "home.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, putSchema);
  if (body instanceof NextResponse) return body;
  const page = await getHomePage();
  const who = g.user.name || g.user.login;
  // кто-то другой сохранил черновик, пока этот редактор был открыт — не затираем молча
  if (body.baseUpdatedAt && page.draftUpdatedBy && page.draftUpdatedBy !== who && new Date(body.baseUpdatedAt) < page.draftUpdatedAt) {
    return NextResponse.json(
      { error: `Черновик уже изменил(а) ${page.draftUpdatedBy} в ${page.draftUpdatedAt.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" })}. Обновите страницу, чтобы не потерять чужие правки.`, conflict: true },
      { status: 409 }
    );
  }
  const saved = await prisma.sitePage.update({
    where: { key: HOME_KEY },
    data: { draft: body.content as unknown as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedBy: who },
  });
  await logAction(g.user, g.ip, { action: "home.draft", entity: "page", entityId: HOME_KEY, summary: "Главная: сохранён черновик", after: body.content });
  return NextResponse.json({ ok: true, draftUpdatedAt: saved.draftUpdatedAt, draftUpdatedBy: saved.draftUpdatedBy });
}
