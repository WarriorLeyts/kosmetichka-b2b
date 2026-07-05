import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-fallback");
}

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!["admin", "manager"].includes(role)) return null;
    return { id: payload.id as number, role };
  } catch {
    return null;
  }
}

// GET /api/admin/products/search?q=текст&limit=40
// q is optional — empty returns first products alphabetically
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "40"), 100);

  const categoryGuid = request.nextUrl.searchParams.get("categoryGuid") ?? "";

  const where: Prisma.ProductWhereInput = {};

  if (q.length >= 2) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
      { article: { contains: q, mode: "insensitive" } },
    ];
  }

  if (categoryGuid) {
    where.categoryGuid = categoryGuid;
  }

  const products = await prisma.product.findMany({
    where,
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      barcode: true,
      article: true,
      stock: true,
      prices: {
        select: { priceType: true, price: true },
        orderBy: { price: "asc" },
      },
      images: {
        take: 1,
        select: { path: true },
      },
    },
  });

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode ?? null,
    article: p.article ?? null,
    stock: p.stock ?? null,
    // Return lowest price as default, manager can edit
    price: p.prices[0]?.price ?? 0,
    prices: p.prices,
    imagePath: p.images[0]?.path ?? null,
  }));

  return NextResponse.json({ products: result });
}
