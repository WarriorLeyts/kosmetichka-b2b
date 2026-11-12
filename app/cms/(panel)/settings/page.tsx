import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const user = await requireCmsPage();
  return <SettingsClient canEdit={can(user, "settings.edit")} />;
}
