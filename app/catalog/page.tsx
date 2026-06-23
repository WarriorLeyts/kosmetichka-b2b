import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { CatalogClient } from "@/components/catalog/CatalogClient";

export default async function CatalogPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });

  return (
    <Suspense>
      <CatalogClient categories={categories} brands={brands} />
    </Suspense>
  );
}
