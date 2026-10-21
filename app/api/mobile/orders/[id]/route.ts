import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../../_auth";

// GET /api/mobile/orders/:id — one order of the logged-in customer
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customerId = await currentCustomerId();
  if (!customerId) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!order || order.customerId !== customerId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    total: order.total,
    comment: order.comment,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      variantName: item.variantName,
      barcode: item.barcode,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    })),
  });
}
