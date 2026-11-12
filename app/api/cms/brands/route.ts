import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";

// GET /api/cms/brands — бренды с количеством товаров (фильтры, массовое назначение бренда)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const rows = await prisma.brand.findMany({ select: { guid: true, name: true, _count: { select: { products: true } } }, orderBy: { name: "asc" } });
  return NextResponse.json({ brands: rows.filter((b) => b.name.trim()).map((b) => ({ guid: b.guid, name: b.name.trim(), count: b._count.products })) });
}
