import { productPath } from "@/lib/productSlug";
import { MetadataRoute } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { categorySlugs, getCatalogSettings } from "@/lib/catalogSettings";

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

    // category pages (/catalog/<slug>): the ones with goods for sale, not hidden in the admin panel
    const [cats, counts, settings, docs] = await Promise.all([
      prisma.category.findMany({ select: { guid: true, name: true, parentGuid: true } }),
      prisma.product.groupBy({ by: ["categoryGuid"], where: { stock: { gt: 0 }, hidden: false }, _count: { _all: true } }),
      getCatalogSettings(),
      prisma.sitePage.findMany({ where: { key: { startsWith: "doc:" }, NOT: { published: { equals: Prisma.DbNull } } }, select: { key: true, publishedAt: true } }),
    ]);
    // a category has goods if it or any category under it has them
    const withGoods = new Set(counts.map((c) => c.categoryGuid).filter((g): g is string => !!g));
    const parentOf = new Map(cats.map((c) => [c.guid, c.parentGuid]));
    for (const g of [...withGoods]) for (let p = parentOf.get(g); p && !withGoods.has(p); p = parentOf.get(p)) withGoods.add(p);
    const slugs = categorySlugs(cats);
    const categoryPages: MetadataRoute.Sitemap = cats
      .filter((c) => withGoods.has(c.guid) && !settings.categories.hidden.includes(c.guid) && c.name.toLowerCase() !== "каталог")
      .map((c) => ({ url: `${baseUrl}/catalog/${slugs.get(c.guid)}`, changeFrequency: "daily" as const, priority: 0.8 }));
    // pages added in the admin panel (Страницы), when published
    const builtin = ["contacts", "privacy", "agreement"];
    const docPages: MetadataRoute.Sitemap = docs
      .map((d) => ({ slug: d.key.slice(4), at: d.publishedAt }))
      .filter((d) => !builtin.includes(d.slug))
      .map((d) => ({ url: `${baseUrl}/info/${d.slug}`, lastModified: d.at ?? undefined, changeFrequency: "monthly" as const, priority: 0.5 }));

    return [...staticPages, ...categoryPages, ...docPages, ...productPages];
  } catch {
    return staticPages;
  }
}
