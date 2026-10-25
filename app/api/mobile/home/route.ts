import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

let memo: { at: number; body: unknown } | null = null;

// GET /api/mobile/home — counters for the app's home screen (cached 5 minutes)
export async function GET() {
  if (!memo || Date.now() - memo.at > 300_000) {
    const [totalProducts, totalBrands, totalCategories] = await Promise.all([
      prisma.product.count(),
      prisma.brand.count(),
      prisma.category.count(),
    ]);
    memo = { at: Date.now(), body: { totalProducts, totalBrands, totalCategories } };
  }
  return NextResponse.json(memo.body, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" },
  });
}
