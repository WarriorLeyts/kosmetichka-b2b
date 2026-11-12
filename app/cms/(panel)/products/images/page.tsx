import { requireCmsPage } from "@/lib/cms/page";
import { PhotoImport } from "./PhotoImport";

export const metadata = { title: "Загрузка фото" };

export default async function ImagesPage() {
  await requireCmsPage("products.photos");
  return <PhotoImport />;
}
