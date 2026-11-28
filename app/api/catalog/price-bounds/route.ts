import { catalogPhotoWhere } from "@/scripts/catalog-visibility.js";
import { visibleBrandsWhere } from "@/lib/brandVisibility";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const result = await prisma.productPrice.aggregate({
    where: { priceType: "wholesale", product: { hidden: false, ...catalogPhotoWhere(), AND: [await visibleBrandsWhere()] } },
    _min: { price: true },
    _max: { price: true },
  });

  return NextResponse.json({
    min: Math.floor(result._min.price ?? 0),
    max: Math.ceil(result._max.price ?? 10000),
  });
}
