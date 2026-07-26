// v1.0.1
import { prisma } from "@/lib/prisma";
import { HomeClient } from "@/components/home/HomeClient";

export default async function Home() {
  const [totalProducts, totalBrands, totalCategories] = await Promise.all([
    prisma.product.count(),
    prisma.brand.count(),
    prisma.category.count(),
  ]);

  return (
    <HomeClient
      totalProducts={totalProducts}
      totalBrands={totalBrands}
      totalCategories={totalCategories}
    />
  );
}
