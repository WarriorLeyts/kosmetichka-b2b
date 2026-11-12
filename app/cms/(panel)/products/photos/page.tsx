import { requireCmsPage } from "@/lib/cms/page";
import { ZipPhotos } from "./ZipPhotos";

export const metadata = { title: "Фото из ZIP" };

export default async function ZipPhotosPage() {
  await requireCmsPage("products.photos");
  return <ZipPhotos />;
}
