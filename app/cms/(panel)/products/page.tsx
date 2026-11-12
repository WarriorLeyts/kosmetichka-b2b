import { Suspense } from "react";
import { requireCmsPage } from "@/lib/cms/page";
import { ProductsTable } from "./ProductsTable";

export const metadata = { title: "Товары" };

export default async function ProductsPage() {
  await requireCmsPage("products.edit");
  return (
    <Suspense fallback={<div className="text-sm text-neutral-500">Загрузка…</div>}>
      <ProductsTable />
    </Suspense>
  );
}
