import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AdminOrderClient from "./AdminOrderClient";

export const dynamic = "force-dynamic";

export default async function AdminOrderEditPage({
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
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      statusLogs: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AdminOrderClient order={order as any} />;
}
