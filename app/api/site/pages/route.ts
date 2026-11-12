import { NextResponse } from "next/server";
import { menuDocs, publishedDoc } from "@/lib/cms/docs";
import { DOC_DEFAULTS } from "@/lib/cms/docDefaults";

export const dynamic = "force-dynamic";

/**
 * GET /api/site/pages — for the apps («О компании»): the pages for the menu (title + address on the site)
 * and the requisites from «Контакты» (the first table of the page), both as edited in the admin panel.
 */
export async function GET() {
  const [menu, contacts] = await Promise.all([menuDocs(), publishedDoc("contacts")]);
  const c = contacts ?? DOC_DEFAULTS.contacts;
  return NextResponse.json(
    { menu, requisites: c.groups[0]?.rows ?? [], contactGroups: c.groups },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}
