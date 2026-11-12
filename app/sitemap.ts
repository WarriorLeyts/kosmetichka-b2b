import { productPath } from "@/lib/productSlug";
import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

// rebuilt once an hour (it was built once per deploy: new products from 1C reached search engines late)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://kosmetichka-opt.ru";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/catalog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/agreement`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/contacts`,
      lastModified: new Date("2025-01-01"),
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  // Product pages
  try {
    const products = await prisma.product.findMany({
      select: { id: true, slug: true, updatedAt: true },
      // products that can be bought now; the ones out of stock come back with the next stock
      where: { stock: { gt: 0 }, hidden: false },
    });

    const productPages: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${baseUrl}${productPath(p)}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...staticPages, ...productPages];
  } catch {
    return staticPages;
  }
}
