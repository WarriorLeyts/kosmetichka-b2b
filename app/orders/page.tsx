import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import OrdersPageClient from "./OrdersPageClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) redirect("/login");

  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { customerId: Number(payload.id) },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  const productIds = [
    ...new Set(orders.flatMap((o) => o.items.map((i) => i.productId))),
  ];

  const productImages = productIds.length
    ? await prisma.productImage.findMany({
        where: { productId: { in: productIds } },
        orderBy: { id: "asc" },
      })
    : [];

  const imageByProductId = new Map<number, string>();
  for (const img of productImages) {
    if (!imageByProductId.has(img.productId)) {
      imageByProductId.set(img.productId, img.path);
    }
  }

  // Stats: completed orders (payment / exported)
  const confirmedOrders = orders.filter(
    (o) => o.status === "payment" || o.status === "exported"
  );

  const totalOrders = confirmedOrders.length;
  const totalSum = confirmedOrders.reduce((s, o) => s + o.total, 0);

  const qtByName = new Map<string, number>();
  for (const order of confirmedOrders) {
    for (const item of order.items) {
      qtByName.set(item.productName, (qtByName.get(item.productName) ?? 0) + item.quantity);
    }
  }
  let topProduct: string | null = null;
  let topProductQty = 0;
  for (const [name, qty] of qtByName) {
    if (qty > topProductQty) { topProduct = name; topProductQty = qty; }
  }

  const serialized = orders.map((o) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    comment: o.comment ?? null,
    createdAt: o.createdAt.toISOString(),
    customerConfirmed: o.customerConfirmed,
    items: o.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode ?? null,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      imagePath: imageByProductId.get(item.productId) ?? null,
      variantImageUrl: item.variantImageUrl ?? null,  // /1c/... path — use directly in <img>
      variantName: item.variantName ?? null,
    })),
  }));

  return (
    <main className="orders-page">
      <Link href="/catalog" className="orders-back-link">
        <ArrowLeft size={18} />
        {"Назад в каталог"}
      </Link>

      <h1 className="orders-title">{"Мои заказы"}</h1>

      <OrdersPageClient
        orders={serialized}
        stats={{ totalOrders, totalSum, topProduct, topProductQty }}
      />
    </main>
  );
}
