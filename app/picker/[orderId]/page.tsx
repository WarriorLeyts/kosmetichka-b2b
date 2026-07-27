import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import PickerOrderClient from "./PickerOrderClient";

export const dynamic = "force-dynamic";

export default async function PickerOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/admin");
  const allowedRoles = ["picker", "admin", "manager"];
  if (!allowedRoles.includes(payload.role as string)) redirect("/admin");
  // ─────────────────────────────────────────────────────────────────────────

  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      customer: true,
      items: {
        include: {
          check: true,
          photos: true,
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

  // Fetch product images and barcodes by productId
  const productIds = order.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      barcode: true,
      images: { take: 1, select: { path: true } },
    },
  });

  const imageMap: Record<number, string | null> = {};
  const productBarcodeMap: Record<number, string | null> = {};
  for (const p of products) {
    const rawPath = p.images[0]?.path ?? null;
    const imagesBase = process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? "https://kosmetichka-opt.ru";
    imageMap[p.id] = rawPath
      ? rawPath.startsWith("http")
        ? rawPath
        : `${imagesBase}/api/1c/${rawPath}`
      : null;
    productBarcodeMap[p.id] = p.barcode ?? null;
  }

  // Fill in missing barcodes from the Product table
  const serializedOrder = {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      barcode: item.barcode ?? productBarcodeMap[item.productId] ?? null,
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PickerOrderClient order={serializedOrder as any} imageMap={imageMap} />;
}
