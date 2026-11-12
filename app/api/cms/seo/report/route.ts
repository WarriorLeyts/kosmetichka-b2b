import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { SEO_LIMITS } from "@/lib/cms/seoTemplate";

export const dynamic = "force-dynamic";

// GET /api/cms/seo/report — состояние SEO опубликованных товаров: пустые, по шаблону, вручную, дубли, длина
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const [counts] = await prisma.$queryRaw<
    { total: number; empty: number; template: number; manual: number; longTitle: number; longDesc: number; shortTitle: number; shortDesc: number }[]
  >`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE("seoTitle", '') = '' OR COALESCE("seoDescription", '') = '')::int AS empty,
      COUNT(*) FILTER (WHERE "seoSource" = 'template')::int AS template,
      COUNT(*) FILTER (WHERE "seoSource" = 'manual')::int AS manual,
      COUNT(*) FILTER (WHERE length("seoTitle") > ${SEO_LIMITS.title.max})::int AS "longTitle",
      COUNT(*) FILTER (WHERE length("seoDescription") > ${SEO_LIMITS.description.max})::int AS "longDesc",
      COUNT(*) FILTER (WHERE length("seoTitle") BETWEEN 1 AND ${SEO_LIMITS.title.min - 1})::int AS "shortTitle",
      COUNT(*) FILTER (WHERE length("seoDescription") BETWEEN 1 AND ${SEO_LIMITS.description.min - 1})::int AS "shortDesc"
    FROM "Product" WHERE hidden = false`;
  const dups = await prisma.$queryRaw<{ title: string; n: number }[]>`
    SELECT "seoTitle" AS title, COUNT(*)::int AS n FROM "Product"
    WHERE hidden = false AND COALESCE("seoTitle", '') <> '' GROUP BY "seoTitle" HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 20`;
  const dupNames = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COALESCE(SUM(c), 0)::int AS n FROM (SELECT COUNT(*) AS c FROM "Product" WHERE hidden = false GROUP BY lower(name) HAVING COUNT(*) > 1) t`;
  return NextResponse.json({ ...counts, duplicates: dups, sameNameProducts: dupNames[0]?.n ?? 0 });
}
