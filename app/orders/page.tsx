import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { redirect } from "next/navigation";
import OrdersPageClient from "./OrdersPageClient";
import Link from "next/link";
import PaginationBar from "@/components/PaginationBar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) redirect("/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const customerId = payload.id as number;
  const p = await searchParams;
  const page = Math.max(1, parseInt(p.page || "1", 10));

  const [totalCount, orders] = await Promise.all([
    prisma.order.count({ where: { customerId } }),
    prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
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
  }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Stats across ALL orders (light aggregate queries)
  const [sumResult, topItems] = await Promise.all([
    prisma.order.aggregate({
      where: { customerId },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      where: { order: { customerId } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    }),
  ]);
  const totalOrders = sumResult._count.id;
  const totalSum = sumResult._sum.total ?? 0;
  const topProduct = topItems[0]?.productName ?? null;
  const topProductQty = topItems[0]?._sum.quantity ?? 0;

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
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-slate-900">Мои заказы</h1>
          {totalCount > PAGE_SIZE && (
            <span className="text-sm text-slate-400">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} из {totalCount}
            </span>
          )}
        </div>
        <OrdersPageClient
          orders={serialized}
          stats={{ totalOrders, totalSum, topProduct, topProductQty }}
        />
        <PaginationBar
          page={page}
          totalPages={totalPages}
          buildHref={(p) => (p === 1 ? "/orders" : `/orders?page=${p}`)}
        />
      </div>
    </main>
  );
}
