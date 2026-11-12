import { requireCmsPage } from "@/lib/cms/page";
import { HomeEditor } from "./HomeEditor";

export const metadata = { title: "Главная страница" };

export default async function HomePage() {
  await requireCmsPage("home.edit");
  return <HomeEditor />;
}
