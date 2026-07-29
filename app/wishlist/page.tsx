import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { WishlistPageClient } from "./WishlistPageClient";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) redirect("/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/login");

  const customerId = payload.id as number;

  const items = await prisma.wishlistItem.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          barcode: true,
          article: true,
          stock: true,
          images: { select: { path: true }, take: 1 },
          prices: { select: { priceType: true, price: true } },
          brand: { select: { name: true } },
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <a
            href="/orders"
            className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-slate-100"
          >
            ←
          </a>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Лист ожидания</h1>
            <p className="text-sm text-slate-400">
              {items.length === 0
                ? "Пусто"
                : `${items.length} ${items.length === 1 ? "товар" : items.length < 5 ? "товара" : "товаров"}`}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div className="mb-3 text-4xl">🔔</div>
            <p className="text-base font-bold text-slate-700">Лист ожидания пуст</p>
            <p className="mt-1 text-sm text-slate-400">
              Добавляйте товары, которых нет в наличии, — мы пришлём уведомление, когда они появятся
            </p>
            <Link
              href="/catalog"
              className="mt-5 inline-block rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-6 py-2.5 text-sm font-black text-white hover:opacity-90 transition"
            >
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <WishlistPageClient items={items} />
        )}
      </div>
    </main>
  );
}
