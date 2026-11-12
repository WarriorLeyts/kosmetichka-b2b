import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { BLOCK_PAGES, blockPageOf, getHomePage } from "@/lib/cms/home";
import { pageContentSchema } from "@/lib/cms/homeSchema";
import { invalidateHome } from "@/lib/cms/homeCache";

// POST /api/cms/home/publish {note?} — опубликовать черновик: сайт и приложения показывают его (≤ 1 минуты)
export async function POST(request: Request) {
  const g = await cmsGuard(request, "home.publish");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, z.object({ note: z.string().trim().max(200).optional() }));
  if (body instanceof NextResponse) return body;
  const key = blockPageOf(request);
  const page = await getHomePage(key);
  const parsed = pageContentSchema.safeParse(page.draft);
  if (!parsed.success) {
    return NextResponse.json({ error: "Черновик с ошибками: " + parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ") }, { status: 400 });
  }
  const who = g.user.name || g.user.login;
  const content = parsed.data as unknown as Prisma.InputJsonValue;
  const [updated] = await prisma.$transaction([
    prisma.sitePage.update({ where: { key }, data: { published: content, publishedAt: new Date(), publishedBy: who } }),
    prisma.sitePageVersion.create({ data: { pageId: page.id, content, note: body.note || null, createdBy: who } }),
  ]);
  invalidateHome();
  await logAction(g.user, g.ip, { action: "home.publish", entity: "page", entityId: key, summary: `${BLOCK_PAGES[key].short}: опубликовано` + (body.note ? `: ${body.note}` : ""), before: page.published, after: parsed.data });
  return NextResponse.json({ ok: true, publishedAt: updated.publishedAt, publishedBy: updated.publishedBy });
}
