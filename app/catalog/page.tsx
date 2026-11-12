import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

import { getCatalogSettings, orderCategories } from "@/lib/catalogSettings";
import { RichText } from "@/lib/richText";

const TITLE = "Каталог косметики и парфюмерии оптом";
const DESCRIPTION = "Каталог оптового магазина «Косметичка»: косметика, парфюмерия, уход и бытовая химия. Актуальные остатки и цены из 1С.";

// title / description / text — admin panel → Каталог → SEO
export async function generateMetadata(): Promise<Metadata> {
  const seo = (await getCatalogSettings()).seo.catalog;
  return { title: seo.title || TITLE, description: seo.description || DESCRIPTION, alternates: { canonical: "/catalog" } };
}
import { Suspense } from "react";
import { CatalogClient } from "@/components/catalog/CatalogClient";

// Категории и бренды приходят из 1С — без revalidate меню каталога
// замораживается на момент сборки.
export const revalidate = 300;

export default async function CatalogPage() {
  const settings = await getCatalogSettings();
  const categories = orderCategories(await prisma.category.findMany({ orderBy: { sortOrder: "asc" } }), settings).filter(
    (c) => !settings.categories.hidden.includes(c.guid)
  );
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <Suspense>
        <CatalogClient categories={categories} brands={brands} />
      </Suspense>
      {settings.seo.catalog.text ? (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <RichText text={settings.seo.catalog.text} />
        </section>
      ) : null}
    </>
  );
}
