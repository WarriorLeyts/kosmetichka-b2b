import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { BannersClient } from "./BannersClient";

export const metadata = { title: "Баннеры" };

export default async function BannersPage() {
  const user = await requireCmsPage("banners.edit");
  return <BannersClient canDelete={can(user, "banners.delete")} />;
}
