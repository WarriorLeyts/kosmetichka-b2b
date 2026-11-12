import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDocPage } from "./docs";
import { docPath, docSlugSchema, isBuiltinDoc } from "./docSchema";

/** «contacts» / «dostavka» from the URL → the page row, or a ready 404 */
export async function docFromParams(params: Promise<{ slug: string }>) {
  const { slug } = await params;
  const ok = isBuiltinDoc(slug) || docSlugSchema.safeParse(slug).success;
  const page = ok ? await getDocPage(slug) : null;
  if (!page) return { error: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) } as const;
  return { slug, page } as const;
}

/** the site page shows the new text now, not after its minute of cache */
export function refreshDocPage(slug: string) {
  for (const p of [docPath(slug), "/sitemap.xml"]) {
    try {
      revalidatePath(p);
    } catch {
      /* outside a request — the minute of cache does it */
    }
  }
}
