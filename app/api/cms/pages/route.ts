import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { parseBody } from "@/lib/cms/validate";
import { getDocPage, readDoc } from "@/lib/cms/docs";
import { BUILTIN_DOCS, docKey, docPath, docSlugSchema, RESERVED_SLUGS } from "@/lib/cms/docSchema";

export const dynamic = "force-dynamic";

// GET /api/cms/pages — страницы сайта: встроенные (контакты, политика, соглашение) и добавленные
export async function GET(request: Request) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  for (const slug of Object.keys(BUILTIN_DOCS)) await getDocPage(slug); // created with the current texts
  const rows = await prisma.sitePage.findMany({ where: { key: { startsWith: "doc:" } }, orderBy: { id: "asc" } });
  const pages = rows.map((r) => {
    const slug = r.key.slice(4);
    const d = readDoc(r.draft, slug);
    return {
      slug,
      title: d.title,
      path: docPath(slug),
      builtin: slug in BUILTIN_DOCS,
      published: !!r.published,
      publishedAt: r.publishedAt,
      publishedBy: r.publishedBy,
      draftUpdatedAt: r.draftUpdatedAt,
      draftUpdatedBy: r.draftUpdatedBy,
      changed: !r.published || JSON.stringify(readDoc(r.published, slug)) !== JSON.stringify(d),
      showInMenu: d.showInMenu,
    };
  });
  pages.sort((a, b) => Number(b.builtin) - Number(a.builtin));
  return NextResponse.json({ pages, canPublish: can(g.user, "pages.publish") });
}

const createSchema = z.object({ slug: docSlugSchema, title: z.string().trim().min(1, "Введите заголовок").max(150) });

// POST /api/cms/pages {slug, title} — новая страница (черновик; на сайте появится после публикации)
export async function POST(request: Request) {
  const g = await cmsGuard(request, "pages.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, createSchema);
  if (body instanceof NextResponse) return body;
  if (RESERVED_SLUGS.has(body.slug)) return NextResponse.json({ error: "Этот адрес занят разделом сайта — выберите другой" }, { status: 409 });
  if (await prisma.sitePage.findUnique({ where: { key: docKey(body.slug) } })) return NextResponse.json({ error: "Страница с таким адресом уже есть" }, { status: 409 });
  const who = g.user.name || g.user.login;
  const draft = readDoc({ title: body.title, body: "", groups: [], showInMenu: true, menuTitle: "" }, body.slug);
  await prisma.sitePage.create({ data: { key: docKey(body.slug), title: body.title, draft: draft as unknown as Prisma.InputJsonValue, draftUpdatedBy: who } });
  await logAction(g.user, g.ip, { action: "page.create", entity: "page", entityId: docKey(body.slug), summary: `Новая страница «${body.title}» (${docPath(body.slug)})` });
  return NextResponse.json({ ok: true, slug: body.slug });
}
