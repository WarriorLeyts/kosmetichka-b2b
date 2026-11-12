import { NextResponse } from "next/server";
import { ANY_STAFF, requireStaff } from "../_auth";
import { prisma } from "@/lib/prisma";
import { ARRIVAL_DAYS, listArrivals } from "@/lib/arrivals";
import { productImageUrl } from "../_shared";

/**
 * GET /api/team/arrivals — «Новые поступления» for staff: everything that came in the last 10 days to the
 * warehouse (receipts) or the shop (transfers) and is in stock, newest first; where it came; «Новинка».
 */
export async function GET() {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  const list = await listArrivals({ wholesale: true, staff: true, limit: 100 });
  const products = await prisma.product.findMany({
    where: { id: { in: list.map((a) => a.productId) } },
    select: { id: true, name: true, stock: true, wholesaleStock: true, images: { take: 1, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { path: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return NextResponse.json({
    days: ARRIVAL_DAYS,
    items: list
      .map((a) => {
        const p = byId.get(a.productId);
        if (!p) return null;
        return {
          productId: p.id,
          name: p.name,
          imagePath: p.images[0]?.path ?? null,
          imageUrl: productImageUrl(p.images[0]?.path ?? null),
          stock: p.stock ?? 0,
          arrivedAt: a.arrivedAt,
          isNew: a.isNew,
          places: a.places.map((x) => (x === "shop" ? "Мега" : "Склад")),
        };
      })
      .filter(Boolean),
  });
}
