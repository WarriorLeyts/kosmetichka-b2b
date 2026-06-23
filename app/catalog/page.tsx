import { prisma } from "@/lib/prisma";
import { CatalogClient } from "@/components/catalog/CatalogClient";

export default async function CatalogPage() {
  const categories = await prisma.category.findMany({
    orderBy: {
      name: "asc",
    },
  });

  const brands = await prisma.brand.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return <CatalogClient categories={categories} brands={brands} />;
}