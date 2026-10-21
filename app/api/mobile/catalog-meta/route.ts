import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/mobile/catalog-meta — categories + brands for the catalog filters
export async function GET() {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ categories, brands });
}
