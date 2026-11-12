import { requireCmsPage } from "@/lib/cms/page";
import { can } from "@/lib/cms/auth";
import { CmsSidebar } from "@/components/cms/Sidebar";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCmsPage();
  return (
    <div className="flex min-h-full">
      <CmsSidebar user={{ name: user.name || user.login, role: user.role }} canAudit={can(user, "audit.view")} />
      <main className="min-w-0 flex-1 bg-neutral-50/60 px-4 pb-5 pt-16 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
