import { requireCmsPage } from "@/lib/cms/page";
import { SeoClient } from "./SeoClient";

export const metadata = { title: "Массовое SEO" };

export default async function SeoPage() {
  await requireCmsPage("products.edit");
  return <SeoClient />;
}
