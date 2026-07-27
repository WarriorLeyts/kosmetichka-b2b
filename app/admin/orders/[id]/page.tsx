import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import AdminOrderClient from "./AdminOrderClient";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin");
  const payload = await verifyToken(token);
  if (!payload?.id) redirect("/admin");
  const allowedRoles = ["admin", "manager"];
  if (!allowedRoles.includes(payload.role as string)) redirect("/admin");
  // ─────────────────────────────────────────────────────────────────────────

  const { id } = await params;

  const [order, pickers, customerMessages] = await Promise.all([
    prisma.order.findUnique({
      where: { id: Number(id) },
      include: {
        customer: true,
        picker: { select: { id: true, name: true } },
        items: {
          include: {
            check: {
              include: { picker: { select: { name: true } } },
            },
            photos: true,
          },
          orderBy: { id: "asc" },
        },
        messages: {
          where: { source: "picker" },
          include: { user: { select: { name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
        statusLogs: {
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "picker" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.orderMessage.findMany({
      where: { orderId: Number(id), source: "customer" },
      orderBy: { createdAt: "asc" },
      select: { id: true, text: true, isFromPicker: true, createdAt: true },
    }),
  ]);

  if (!order) notFound();

  // Fetch product images and barcodes for all items in the order
  const productIds = order.items.map((i) => i.productId);
  const [productImageRows, productRows] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, path: true },
      orderBy: { id: "asc" },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, barcode: true },
    }),
  ]);
  const productImages: Record<number, string | null> = {};
  for (const img of productImageRows) {
    if (!productImages[img.productId]) {
      productImages[img.productId] = img.path;
    }
  }
  const productBarcodeMap: Record<number, string | null> = {};
  for (const p of productRows) {
    productBarcodeMap[p.id] = p.barcode ?? null;
  }

  const serialized = {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: undefined,
    customerConfirmed: order.customerConfirmed,
    pickerId: order.pickerId ?? null,
    picker: order.picker ?? null,
    customer: {
      companyName: order.customer.companyName,
      name: order.customer.name,
      phone: order.customer.phone,
      city: order.customer.city ?? null,
      inn: order.customer.inn ?? null,
      manager: order.customer.manager ?? null,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode ?? productBarcodeMap[item.productId] ?? null,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      check: item.check
        ? {
            status: item.check.status,
            note: item.check.note ?? null,
            availableQty: item.check.availableQty ?? null,
            picker: item.check.picker ?? null,
            updatedAt: item.check.checkedAt.toISOString(),
          }
        : null,
      photos: item.photos.map((p) => ({ id: p.id, url: p.url })),
      variantName: item.variantName ?? null,
      variantImageUrl: item.variantImageUrl ?? null,
    })),
    messages: order.messages.map((m) => ({
      id: m.id,
      text: m.text,
      isFromPicker: m.isFromPicker,
      createdAt: m.createdAt.toISOString(),
      user: m.user ?? null,
    })),
    statusLogs: order.statusLogs.map((l) => ({
      id: l.id,
      fromStatus: l.fromStatus ?? null,
      toStatus: l.toStatus,
      createdAt: l.createdAt.toISOString(),
    })),
    customerMessages: customerMessages.map((m) => ({
      id: m.id,
      text: m.text,
      isFromPicker: m.isFromPicker,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return (
    <AdminOrderClient
      order={serialized as any}
      pickers={pickers}
      customerMessages={serialized.customerMessages}
      productImages={productImages}
    />
  );
}
