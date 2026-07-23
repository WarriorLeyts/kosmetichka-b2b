import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function resolveImageUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `https://kosmetichka-opt.ru/api/1c/${path}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const variants = await prisma.productVariant.findMany({
    where: { productId: Number(id) },
    include: { image: { select: { id: true, path: true } } },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    variants: variants.map((v) => ({
      id: v.id,
      imageId: v.imageId,
      imageUrl: resolveImageUrl(v.image.path),
      name: v.name,
    })),
  });
}
