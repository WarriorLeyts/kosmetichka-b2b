import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getCustomer() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  return { id: payload.id };
}

// GET /api/orders/products/search?q=QUERY&limit=20
export async function GET(request: NextRequest) {
  const customer = await getCustomer();
  if (!customer) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "20"), 50);

  if (q.length < 2) return NextResponse.json({ products: [] });

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { article: { contains: q, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      prices: { select: { priceType: true, price: true } },
      images: { take: 1, select: { path: true } },
    },
  });

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    price:
      (
        p.prices.find((pr) => pr.priceType === "wholesale") ??
        p.prices.find((pr) => pr.priceType === "retail") ??
        p.prices[0]
      )?.price ?? 0,
    imagePath: p.images[0]?.path ?? null,
  }));

  return NextResponse.json({ products: result });
}
