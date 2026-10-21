import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/mobile/home — counters for the app's home screen
export async function GET() {
  const [totalProducts, totalBrands, totalCategories] = await Promise.all([
    prisma.product.count(),
    prisma.brand.count(),
    prisma.category.count(),
  ]);
  return NextResponse.json({ totalProducts, totalBrands, totalCategories });
}
