import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { productWhere, SORTS } from "@/lib/cms/productFilter";
import { resolveImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

// GET /api/cms/products — таблица товаров: поиск, фильтры, сортировка, страницы (на сервере)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(200, Math.max(5, Number(sp.get("limit")) || 50));
  const where = await productWhere(sp);
  const sortKey = SORTS[sp.get("sort") ?? ""] ? (sp.get("sort") as string) : "updated";
  const dir: Prisma.SortOrder = sp.get("dir") === "asc" ? "asc" : "desc";

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [...SORTS[sortKey](dir), { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        article: true,
        barcode: true,
        name: true,
        stock: true,
        hidden: true,
        labels: true,
        salesCount: true,
        updatedAt: true,
        description: true,
        shortDescription: true,
        seoTitle: true,
        seoDescription: true,
        seoSource: true,
        categoryManual: true,
        brandManual: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
        images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { path: true } },
        _count: { select: { images: true } },
        prices: { where: { priceType: "retail" }, select: { price: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    total,
    page,
    limit,
    items: rows.map((r) => ({
      id: r.id,
      article: r.article,
      barcode: r.barcode || null,
      name: r.name,
      brand: r.brand?.name ?? null,
      category: r.category?.name ?? null,
      stock: r.stock,
      hidden: r.hidden,
      labels: r.labels,
      salesCount: r.salesCount,
      updatedAt: r.updatedAt,
      hasDescription: !!r.description?.trim(),
      hasShort: !!r.shortDescription?.trim(),
      seo: r.seoTitle?.trim() && r.seoDescription?.trim() ? (r.seoSource === "template" ? "template" : "full") : r.seoTitle?.trim() || r.seoDescription?.trim() ? "partial" : "none",
      overridden: r.categoryManual || r.brandManual,
      photos: r._count.images,
      image: resolveImageUrl(r.images[0]?.path, 160),
      retail: r.prices[0]?.price ?? null,
    })),
  });
}
