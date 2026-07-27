import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { redirect } from "next/navigation";
import OrdersPageClient from "./OrdersPageClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) redirect("/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const customerId = payload.id as number;

  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          productName: true,
          barcode: true,
          quantity: true,
          price: true,
          total: true,
          variantImageUrl: true,
          variantName: true,
        },
      },
    },
  });

  // Stats
  const totalOrders = orders.length;
  const totalSum = orders.reduce((s, o) => s + o.total, 0);

  // Top product by total quantity across all orders
  const productQty: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      productQty[item.productName] = (productQty[item.productName] ?? 0) + item.quantity;
    }
  }
  let topProduct: string | null = null;
  let topProductQty = 0;
  for (const [name, qty] of Object.entries(productQty)) {
    if (qty > topProductQty) {
      topProduct = name;
      topProductQty = qty;
    }
  }

  const serialized = orders.map((o) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    comment: o.comment,
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
      variantImageUrl: item.variantImageUrl ?? null,
      variantName: item.variantName ?? null,
    })),
  }));

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <nav className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href="/catalog" className="text-lg font-black text-slate-900">
          Косметичка
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/catalog"
            className="rounded-xl border px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Каталог
          </Link>
          <Link
            href="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-100 text-slate-600"
            title="Профиль"
          >
            👤
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-black text-slate-900">Мои заказы</h1>
        <OrdersPageClient
          orders={serialized}
          stats={{ totalOrders, totalSum, topProduct, topProductQty }}
        />
      </div>
    </main>
  );
}
