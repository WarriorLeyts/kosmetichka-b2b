import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminProductImagesClient } from "./AdminProductImagesClient";

export default async function AdminProductImagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Auth guard — server side
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) redirect("/admin/login");
  const payload = await verifyToken(token);
  if (!payload?.id || !["admin", "manager"].includes(payload.role as string)) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      name: true,
      barcode: true,
      article: true,
      guid: true,
      images: { select: { id: true, path: true } },
    },
  });

  if (!product) redirect("/admin/orders");

  return <AdminProductImagesClient product={product} />;
}
