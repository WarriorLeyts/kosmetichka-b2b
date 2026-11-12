import { NextResponse } from "next/server";
import { blockPageOf, getHomePage, readContent, resolveBlocks } from "@/lib/cms/home";
import { getHomeMemo, setHomeMemo } from "@/lib/cms/homeCache";

export const dynamic = "force-dynamic";

/**
 * GET /api/site/home[?page=catalog] — опубликованные блоки для сайта и приложений: главная или верх каталога.
 * blocks: null — страницу ещё ни разу не публиковали: приложение показывает своё прежнее оформление.
 */
export async function GET(request: Request) {
  const key = blockPageOf(request);
  let body = getHomeMemo(key);
  if (!body) {
    const page = await getHomePage(key);
    body = page.published
      ? { publishedAt: page.publishedAt, blocks: await resolveBlocks(readContent(page.published, key)) }
      : { publishedAt: null, blocks: null };
    setHomeMemo(body, key);
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
