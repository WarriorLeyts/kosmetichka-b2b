import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PickerOrderClient from "./PickerOrderClient";

export const dynamic = "force-dynamic";

export default async function PickerOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      customer: true,
      items: {
        include: {
          check: true,
        },
      },
    },
  });

  if (!order) notFound();

  if (order.status !== "assembly") {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center">
        <p className="text-slate-600">
          Этот заказ не на стадии сборки (статус: {order.status})
        </p>
        <a
          href="/picker"
          className="mt-4 inline-block rounded-xl border px-6 py-3 font-bold"
        >
          ← Назад
        </a>
      </div>
    );
  }

  // Fetch product images by productId
  const productIds = order.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { images: { take: 1 } },
  });

  const imageMap: Record<number, string | null> = {};
  for (const p of products) {
    const rawPath = p.images[0]?.path ?? null;
    imageMap[p.id] = rawPath
      ? rawPath.startsWith("http")
        ? rawPath
        : `https://kosmetichka-opt.ru/api/1c/${rawPath}`
      : null;
  }

  return <PickerOrderClient order={order} imageMap={imageMap} />;
}
