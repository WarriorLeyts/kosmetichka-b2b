import { NextResponse } from "next/server";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { productIdsByFilter } from "@/lib/cms/productFilter";

// GET /api/cms/products/ids?<фильтры таблицы> — все товары по фильтру (для «выбрать все N»), до 20 000
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const ids = await productIdsByFilter(new URL(request.url).searchParams);
  return NextResponse.json({ ids, capped: ids.length >= 20000 });
}
