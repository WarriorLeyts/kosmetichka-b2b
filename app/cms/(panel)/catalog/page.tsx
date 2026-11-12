import Link from "next/link";
import { requireCmsPage } from "@/lib/cms/page";
import { cn } from "@/lib/utils";
import { HomeEditor } from "../home/HomeEditor";
import { CatalogSettingsClient } from "./CatalogSettingsClient";

export const metadata = { title: "Каталог" };

const TABS = [
  ["blocks", "Блоки сверху"],
  ["filters", "Быстрые фильтры"],
  ["categories", "Категории"],
  ["seo", "SEO"],
] as const;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCmsPage("pages.edit");
  const { tab: t } = await searchParams;
  const tab = TABS.some(([k]) => k === t) ? (t as (typeof TABS)[number][0]) : "blocks";
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map(([k, l]) => (
          <Link
            key={k}
            href={`/catalog?tab=${k}`}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-[#8E1B47] font-medium text-[#8E1B47]" : "border-transparent text-neutral-600 hover:text-neutral-900")}
          >
            {l}
          </Link>
        ))}
      </div>
      {tab === "blocks" ? <HomeEditor page="catalog" /> : <CatalogSettingsClient tab={tab} />}
    </div>
  );
}
