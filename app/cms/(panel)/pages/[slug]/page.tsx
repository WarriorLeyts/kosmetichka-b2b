import { requireCmsPage } from "@/lib/cms/page";
import { DocEditor } from "./DocEditor";

export const metadata = { title: "Страница" };

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireCmsPage("pages.edit");
  const { slug } = await params;
  return <DocEditor slug={slug} />;
}
