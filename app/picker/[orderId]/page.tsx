import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import PickerOrderClient from "./PickerOrderClient";

export const dynamic = "force-dynamic";

export default async function PickerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/picker/login");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/picker/login");
  const allowedRoles = ["picker", "admin", "manager"];
  if (!allowedRoles.includes(payload.role as string)) redirect("/picker/login");
  // ─────────────────────────────────────────────────────────────────────────

  const { orderId } = await params;
  const { returnUrl } = await searchParams;
  const isAdminOrManager = ["admin", "manager"].includes(payload.role as string);

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

  // Allow admins/managers to access regardless of status; pickers only during assembly
  if (order.status !== "assembly" && !isAdminOrManager) {
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

  const backUrl = returnUrl ?? (isAdminOrManager ? `/admin/orders/${order.id}` : "/picker");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PickerOrderClient order={order as any} imageMap={imageMap} returnUrl={backUrl} />;
}
