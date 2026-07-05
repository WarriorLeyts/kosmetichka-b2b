import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AdminOrderClient from "./AdminOrderClient";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      items: {
        include: {
          check: {
            include: { picker: { select: { name: true } } },
          },
          photos: true,
        },
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
  });

  if (!order) notFound();

  const serialized = {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: undefined,
    customer: {
      companyName: order.customer.companyName,
      name: order.customer.name,
      phone: order.customer.phone,
      city: order.customer.city,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      check: item.check
        ? {
            status: item.check.status,
            note: item.check.note,
            availableQty: item.check.availableQty,
            picker: item.check.picker,
            updatedAt: item.check.checkedAt.toISOString(),
          }
        : null,
      photos: item.photos.map((p) => ({ id: p.id, url: p.url })),
    })),
    messages: order.messages.map((m) => ({
      id: m.id,
      text: m.text,
      isFromPicker: m.isFromPicker,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
    statusLogs: order.statusLogs.map((l) => ({
      id: l.id,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      createdAt: l.createdAt.toISOString(),
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AdminOrderClient order={serialized as any} />;
}
