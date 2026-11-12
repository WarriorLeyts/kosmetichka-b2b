import { notFound } from "next/navigation";
import { requireCmsPage } from "@/lib/cms/page";
import { ProductEditor } from "./ProductEditor";

export const metadata = { title: "Товар" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCmsPage("products.edit");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <ProductEditor id={id} />;
}
