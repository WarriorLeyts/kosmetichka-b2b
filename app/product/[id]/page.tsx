import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductPageClient } from "@/components/catalog/ProductPageClient";
import { withFlatPrices } from "@/lib/utils";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: {
      id: Number(id),
    },
    include: {
      category: true,
      brand: true,
      images: true,
      prices: true,
    },
  });

  if (!product) {
    notFound();
  }

  const relatedProducts = product.brandGuid
    ? await prisma.product.findMany({
        where: {
          brandGuid: product.brandGuid,
          id: {
            not: product.id,
          },
        },
        take: 8,
        include: {
          category: true,
          brand: true,
          images: true,
          prices: true,
        },
        orderBy: {
          name: "asc",
        },
      })
    : [];

  return (
    <ProductPageClient
      product={withFlatPrices(product)}
      relatedProducts={relatedProducts.map(withFlatPrices)}
    />
  );
}