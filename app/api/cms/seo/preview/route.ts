import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { parseBody } from "@/lib/cms/validate";
import { fitLength, lengthIssue, renderTemplate, SEO_LIMITS, unknownVars } from "@/lib/cms/seoTemplate";

// POST /api/cms/seo/preview {title, description, ids?} — как шаблоны лягут на товары (8 примеров)
export async function POST(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const body = await parseBody(request, z.object({ title: z.string().max(200), description: z.string().max(400), ids: z.array(z.number().int().positive()).max(20).optional() }));
  if (body instanceof NextResponse) return body;
  const bad = [...unknownVars(body.title), ...unknownVars(body.description)];
  if (bad.length) return NextResponse.json({ error: `Неизвестные переменные: ${bad.map((b) => `{${b}}`).join(", ")}` }, { status: 400 });
  const rows = await prisma.product.findMany({
    where: body.ids?.length ? { id: { in: body.ids } } : { hidden: false, stock: { gt: 0 } },
    orderBy: { salesCount: "desc" },
    take: 8,
    select: { id: true, name: true, article: true, country: true, brand: { select: { name: true } }, category: { select: { name: true } }, prices: { where: { priceType: "retail" }, select: { price: true } } },
  });
  return NextResponse.json({
    examples: rows.map((r) => {
      const v = { name: r.name, brand: r.brand?.name?.trim() || null, category: r.category?.name ?? null, article: r.article, price: r.prices[0]?.price ?? null, country: r.country };
      const title = fitLength(renderTemplate(body.title, v), SEO_LIMITS.title.max);
      const description = fitLength(renderTemplate(body.description, v), SEO_LIMITS.description.max);
      return { id: r.id, name: r.name, title, description, titleIssue: lengthIssue("title", title), descIssue: lengthIssue("description", description) };
    }),
  });
}
