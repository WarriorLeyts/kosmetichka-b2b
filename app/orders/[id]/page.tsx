import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import OrderDetailClient from "./OrderDetailClient";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) redirect("/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      items: { orderBy: { id: "asc" } },
    },
  });

  // Security: customer can only see their own orders
  if (!order || order.customerId !== Number(payload.id)) notFound();

  const serialized = {
    id: order.id,
    status: order.status,
    total: order.total,
    comment: order.comment,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      barcode: item.barcode,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    })),
  };

  return <OrderDetailClient order={serialized} />;
}
