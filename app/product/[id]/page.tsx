import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductPageClient } from "@/components/catalog/ProductPageClient";
import { withFlatPrices } from "@/lib/utils";
import type { Metadata } from "next";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    select: {
      name: true,
      description: true,
      images: { take: 1 },
      brand: { select: { name: true } },
    },
  });

  if (!product) return {};

  const title = product.name;
  const description = product.description
    ? product.description.slice(0, 160)
    : `Купить ${product.name} оптом в магазине Косметичка. Выгодные цены.`;
  const imageUrl = product.images[0]?.path
    ? product.images[0].path.startsWith("http")
      ? product.images[0].path
      : `https://kosmetichka-opt.ru/api/1c/${product.images[0].path}`
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/product/${id}` },
    openGraph: {
      title,
      description,
      url: `https://kosmetichka-opt.ru/product/${id}`,
      type: "website",
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
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
        where: { brandGuid: product.brandGuid, id: { not: product.id } },
        take: 8,
        include: { category: true, brand: true, images: true, prices: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Schema.org JSON-LD
  const retailPrice = product.prices.find((p) => p.priceType === "retail");
  const wholesalePrice = product.prices.find((p) => p.priceType === "wholesale");
  const price = retailPrice ?? wholesalePrice ?? product.prices[0];
  const imageUrl = product.images[0]?.path
    ? product.images[0].path.startsWith("http")
      ? product.images[0].path
      : `https://kosmetichka-opt.ru/api/1c/${product.images[0].path}`
    : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(product.barcode ? { sku: product.barcode } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            url: `https://kosmetichka-opt.ru/product/${product.id}`,
            priceCurrency: "RUB",
            price: price.price,
            availability:
              (product.stock ?? 0) > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: "Косметичка" },
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductPageClient
        product={withFlatPrices(product)}
        relatedProducts={relatedProducts.map(withFlatPrices)}
      />
    </>
  );
}
