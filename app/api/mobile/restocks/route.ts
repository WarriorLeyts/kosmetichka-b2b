import { visibleBrandsWhere } from "@/lib/brandVisibility";
import { NextResponse } from "next/server";
import { currentCustomerId } from "../_auth";
import { prisma } from "@/lib/prisma";
import { customerStock } from "@/lib/utils";
import { RESTOCK_WINDOW_MS } from "@/lib/customerDemand";

export async function GET() {
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const now = new Date();
  const [customer, rows] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { priceType: true } }),
    prisma.wishlistItem.findMany({ where: { customerId, notified: true, notifiedAt: { gt: new Date(+now - RESTOCK_WINDOW_MS) }, product: { hidden: false, AND: [await visibleBrandsWhere()] } }, orderBy: { notifiedAt: "desc" }, take: 50,
      select: { quantity: true, notifiedAt: true, product: { select: { id: true, name: true, stock: true, wholesaleStock: true, images: { select: { path: true }, take: 1, orderBy: { sortOrder: "asc" } } } } } }),
  ]);
  return NextResponse.json({ items: rows.filter(r => Number(customerStock(r.product.stock, customer?.priceType, r.product.wholesaleStock)) > 0).map(r => ({
    id: r.product.id, name: r.product.name, imagePath: r.product.images[0]?.path ?? null, quantity: r.quantity,
    notifiedAt: r.notifiedAt!.toISOString(), expiresAt: new Date(+r.notifiedAt! + RESTOCK_WINDOW_MS).toISOString(),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
