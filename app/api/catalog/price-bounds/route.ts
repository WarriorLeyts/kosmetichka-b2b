import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const result = await prisma.productPrice.aggregate({
    where: { priceType: "wholesale" },
    _min: { price: true },
    _max: { price: true },
  });

  return NextResponse.json({
    min: Math.floor(result._min.price ?? 0),
    max: Math.ceil(result._max.price ?? 10000),
  });
}
