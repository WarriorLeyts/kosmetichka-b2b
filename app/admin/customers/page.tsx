import { prisma } from "@/lib/prisma";
import { AdminCustomersClient } from "@/components/admin/AdminCustomersClient";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return <AdminCustomersClient customers={customers} />;
}