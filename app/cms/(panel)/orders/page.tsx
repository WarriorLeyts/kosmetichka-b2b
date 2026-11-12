import { Suspense } from "react";
import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { OrdersTable } from "./OrdersTable";

export const metadata = { title: "Заказы" };

export default async function OrdersPage() {
  const user = await requireCmsPage("orders.view");
  return (
    <Suspense fallback={<div className="text-sm text-neutral-500">Загрузка…</div>}>
      <OrdersTable canRetry={can(user, "orders.retry")} />
    </Suspense>
  );
}
