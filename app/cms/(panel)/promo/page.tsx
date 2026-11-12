import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { PromoClient } from "./PromoClient";

export const metadata = { title: "Акция" };

export default async function PromoPage() {
  const user = await requireCmsPage();
  return <PromoClient canEdit={can(user, "settings.edit")} />;
}
