import { NextResponse } from "next/server";
import { getHomePage, readContent, resolveBlocks } from "@/lib/cms/home";
import { getHomeMemo, setHomeMemo } from "@/lib/cms/homeCache";

export const dynamic = "force-dynamic";

/**
 * GET /api/site/home — опубликованная главная для сайта и приложений (блоки из админ-панели).
 * blocks: null — главную ещё ни разу не публиковали: приложение показывает свою прежнюю главную.
 */
export async function GET() {
  let body = getHomeMemo();
  if (!body) {
    const page = await getHomePage();
    body = page.published
      ? { publishedAt: page.publishedAt, blocks: await resolveBlocks(readContent(page.published)) }
      : { publishedAt: null, blocks: null };
    setHomeMemo(body);
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
