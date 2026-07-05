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
          where: { source: { equals: null } },
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
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode ?? null,
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
    />
  );
}
