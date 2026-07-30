import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withFlatPrices } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = Number(id);

  if (isNaN(productId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      brand: true,
      images: true,
      prices: true,
      variants: {
        include: { image: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(withFlatPrices(product));
}
