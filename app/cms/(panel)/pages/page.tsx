import { requireCmsPage } from "@/lib/cms/page";
import { PagesList } from "./PagesList";

export const metadata = { title: "Страницы" };

export default async function PagesPage() {
  await requireCmsPage("pages.edit");
  return <PagesList />;
}
