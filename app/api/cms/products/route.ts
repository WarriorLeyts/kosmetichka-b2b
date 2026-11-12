import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { productSearchWhere } from "@/lib/productSearch";
import { resolveImageUrl } from "@/lib/image";

export const dynamic = "force-dynamic";

const SORTS: Record<string, (dir: Prisma.SortOrder) => Prisma.ProductOrderByWithRelationInput[]> = {
  name: (d) => [{ name: d }],
  updated: (d) => [{ updatedAt: d }],
  created: (d) => [{ createdAt: d }],
  stock: (d) => [{ stock: { sort: d, nulls: "last" } }],
  sales: (d) => [{ salesCount: d }],
  article: (d) => [{ article: { sort: d, nulls: "last" } }],
};

// GET /api/cms/products — таблица товаров: поиск, фильтры, сортировка, страницы
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit")) || 50));
  const search = sp.get("search")?.trim();
  const ids = sp.get("ids");

  const and: Prisma.ProductWhereInput[] = [];
  if (ids) and.push({ id: { in: ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100) } });
  if (search) and.push(productSearchWhere(search));
  const category = sp.get("category");
  if (category) {
    // категория вместе с подкатегориями (два уровня)
    const kids = await prisma.category.findMany({ where: { OR: [{ parentGuid: category }, { parent: { parentGuid: category } }] }, select: { guid: true } });
    and.push({ categoryGuid: { in: [category, ...kids.map((k) => k.guid)] } });
  }
  if (sp.get("brand")) and.push({ brandGuid: sp.get("brand")! });
  if (sp.get("hidden") === "1") and.push({ hidden: true });
  if (sp.get("hidden") === "0") and.push({ hidden: false });
  if (sp.get("photo") === "none") and.push({ images: { none: {} } });
  if (sp.get("photo") === "has") and.push({ images: { some: {} } });
  if (sp.get("desc") === "none") and.push({ OR: [{ description: null }, { description: "" }] });
  if (sp.get("stock") === "in") and.push({ stock: { gt: 0 } });
  if (sp.get("stock") === "out") and.push({ OR: [{ stock: null }, { stock: { lte: 0 } }] });
  const where: Prisma.ProductWhereInput = and.length ? { AND: and } : {};

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
        name: true,
        stock: true,
        hidden: true,
        salesCount: true,
        updatedAt: true,
        description: true,
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
      name: r.name,
      brand: r.brand?.name ?? null,
      category: r.category?.name ?? null,
      stock: r.stock,
      hidden: r.hidden,
      salesCount: r.salesCount,
      updatedAt: r.updatedAt,
      hasDescription: !!r.description?.trim(),
      photos: r._count.images,
      image: resolveImageUrl(r.images[0]?.path, 160),
      retail: r.prices[0]?.price ?? null,
    })),
  });
}
