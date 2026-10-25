import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Categories and brands change only on a 1C import — keep them in memory for 5 minutes
// and let clients cache too (the apps also keep their own copy).
let memo: { at: number; body: unknown } | null = null;

// GET /api/mobile/catalog-meta — categories + brands for the catalog filters
export async function GET() {
  if (!memo || Date.now() - memo.at > 300_000) {
    const [categories, brands] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
    ]);
    memo = { at: Date.now(), body: { categories, brands } };
  }
  return NextResponse.json(memo.body, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" },
  });
}
