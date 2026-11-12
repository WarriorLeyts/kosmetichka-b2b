import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DOC_DEFAULTS } from "./docDefaults";
import { BUILTIN_DOCS, docContentSchema, docKey, docPath, isBuiltinDoc, type DocContent } from "./docSchema";

/** Stored JSON → content (broken → the built-in default / an empty page). */
export function readDoc(raw: unknown, slug: string): DocContent {
  const r = docContentSchema.safeParse(raw);
  if (r.success) return r.data;
  return isBuiltinDoc(slug) ? DOC_DEFAULTS[slug] : docContentSchema.parse({ title: "Новая страница" });
}

/** the row of a document page; the built-in ones are created with the site's current texts */
export async function getDocPage(slug: string) {
  const key = docKey(slug);
  const found = await prisma.sitePage.findUnique({ where: { key } });
  if (found || !isBuiltinDoc(slug)) return found;
  return prisma.sitePage.upsert({
    where: { key },
    update: {},
    create: { key, title: BUILTIN_DOCS[slug].name, draft: DOC_DEFAULTS[slug] as unknown as Prisma.InputJsonValue },
  });
}

/** nothing kept in memory: the API and the site pages are separate module copies, a cache here would not see a publish */
export const invalidateDocs = () => {};

/** the published content of a page for the site (null — not published: a built-in page shows its old text) */
export async function publishedDoc(slug: string): Promise<DocContent | null> {
  try {
    const row = await prisma.sitePage.findUnique({ where: { key: docKey(slug) }, select: { published: true } });
    return row?.published ? readDoc(row.published, slug) : null;
  } catch {
    return null;
  }
}

/** pages for the menus (app «О компании», the bottom of the site): built-in ones always, the others when published */
export async function menuDocs(): Promise<{ slug: string; title: string; path: string }[]> {
  const rows = await prisma.sitePage.findMany({ where: { key: { startsWith: "doc:" } }, select: { key: true, published: true } }).catch(() => []);
  const pub = new Map(rows.filter((r) => r.published).map((r) => [r.key.slice(4), readDoc(r.published, r.key.slice(4))]));
  const out: { slug: string; title: string; path: string }[] = [];
  for (const slug of Object.keys(BUILTIN_DOCS)) {
    const d = pub.get(slug) ?? DOC_DEFAULTS[slug as keyof typeof BUILTIN_DOCS];
    if (d.showInMenu) out.push({ slug, title: d.menuTitle || d.title, path: docPath(slug) });
  }
  for (const [slug, d] of pub) if (!isBuiltinDoc(slug) && d.showInMenu) out.push({ slug, title: d.menuTitle || d.title, path: docPath(slug) });
  return out;
}
