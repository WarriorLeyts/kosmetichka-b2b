import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveImageUrl } from "@/lib/image";
import { getCatalogSettings, orderCategories } from "@/lib/catalogSettings";
import { getCatalogMetaMemo, setCatalogMetaMemo } from "@/lib/catalogMetaCache";

// Categories and brands change only on a 1C import — keep them in memory for 5 minutes
// and let clients cache too (the apps also keep their own copy). The admin panel's catalog settings
// (order / pictures / hidden categories, quick filters) are applied here; saving them drops the memo.

// GET /api/mobile/catalog-meta — categories + brands for the catalog filters, quick filters
export async function GET() {
  let body = getCatalogMetaMemo();
  if (!body) {
    const [categories, brands, s] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
      getCatalogSettings(),
    ]);
    const hidden = new Set(s.categories.hidden);
    body = {
      categories: orderCategories(categories, s).map((c) => ({
        ...c,
        ...(hidden.has(c.guid) ? { hidden: true } : {}),
        ...(s.categories.images[c.guid] ? { imageUrl: resolveImageUrl(s.categories.images[c.guid], 320) } : {}),
      })),
      brands,
      quick: s.quick,
      quickChips: s.quickChips,
    };
    setCatalogMetaMemo(body);
  }
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
