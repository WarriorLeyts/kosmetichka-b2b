import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { OrderView } from "./OrderView";

export const metadata = { title: "Заказ" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCmsPage("orders.view");
  const { id } = await params;
  return <OrderView id={Number(id)} canRetry={can(user, "orders.retry")} />;
}
