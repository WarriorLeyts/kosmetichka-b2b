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

function getImageUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://kosmetichka-opt.ru/api/1c/${path}`;
}

// GET /api/admin/products?q=...&limit=20&offset=0
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "20"), 50);
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? "0"));

  const where: Prisma.ProductWhereInput = {};
  if (q.length >= 2) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
      { article: { contains: q, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    skip: offset,
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      barcode: true,
      article: true,
      images: { select: { id: true, path: true } },
      _count: { select: { variants: true } },
    },
  });

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode ?? null,
    article: p.article ?? null,
    imageUrl: getImageUrl(p.images[0]?.path ?? null),
    imageCount: p.images.length,
    variantCount: p._count.variants,
  }));

  return NextResponse.json({ products: result, hasMore: result.length === limit });
}
