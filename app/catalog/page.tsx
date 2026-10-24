import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Каталог косметики и парфюмерии оптом",
  description: "Каталог оптового магазина «Косметичка»: косметика, парфюмерия, уход и бытовая химия. Актуальные остатки и цены из 1С.",
  alternates: { canonical: "/catalog" },
};
import { Suspense } from "react";
import { CatalogClient } from "@/components/catalog/CatalogClient";

// Категории и бренды приходят из 1С — без revalidate меню каталога
// замораживается на момент сборки.
export const revalidate = 300;

export default async function CatalogPage() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });

  return (
    <Suspense>
      <CatalogClient categories={categories} brands={brands} />
    </Suspense>
  );
}
