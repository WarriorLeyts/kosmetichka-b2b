import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { userAgent } from "next/server";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { AppBar } from "@/components/app/AppBar";
import { categorySlugs, getCatalogSettings } from "@/lib/catalogSettings";
import { productPath } from "@/lib/productSlug";
import { resolveImageUrl } from "@/lib/image";
import { RichText } from "@/lib/richText";

/**
 * /catalog/<slug> — a category page for search engines (title, description and text from the admin panel →
 * Каталог → SEO, the goods of the category and its subcategories). A person is sent to the catalog of the
 * app with this category open (/catalog?category=<guid>) — the same «bots — this page, people — the app»
 * as the product pages.
 */
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

const findCategory = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const cats = await prisma.category.findMany({ select: { guid: true, name: true, parentGuid: true, sortOrder: true } });
  const slugs = categorySlugs(cats);
  const cat = cats.find((c) => slugs.get(c.guid) === slug);
  if (!cat) return null;
  // the category and everything under it
  const ids = new Set([cat.guid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cats) {
      if (c.parentGuid && ids.has(c.parentGuid) && !ids.has(c.guid)) {
        ids.add(c.guid);
        grew = true;
      }
    }
  }
  const children = cats.filter((c) => c.parentGuid === cat.guid).sort((a, b) => a.sortOrder - b.sortOrder);
  const parent = cats.find((c) => c.guid === cat.parentGuid && c.name.toLowerCase() !== "каталог") ?? null;
  return { cat, guids: [...ids], children: children.map((c) => ({ ...c, slug: slugs.get(c.guid)! })), parent: parent ? { ...parent, slug: slugs.get(parent.guid)! } : null };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = await findCategory(slug);
  if (!f) return { title: "Категория не найдена" };
  const seo = (await getCatalogSettings()).seo.categories[f.cat.guid];
  return {
    title: seo?.title || `${f.cat.name} — купить оптом`,
    description: seo?.description || `${f.cat.name} оптом и в розницу в «Косметичке»: актуальные цены и остатки из 1С, доставка и самовывоз в Грозном.`,
    alternates: { canonical: `/catalog/${slug}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const f = await findCategory(slug);
  if (!f) notFound();
  if (!userAgent({ headers: await headers() }).isBot) redirect(`/catalog?category=${encodeURIComponent(f.cat.guid)}`);
  const seo = (await getCatalogSettings()).seo.categories[f.cat.guid];
  const products = await prisma.product.findMany({
    where: { categoryGuid: { in: f.guids }, hidden: false, stock: { gt: 0 } },
    orderBy: [{ salesCount: "desc" }, { id: "desc" }],
    take: 120,
    select: { id: true, slug: true, name: true, images: { take: 1, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { path: true } } },
  });
  return (
    <main className="min-h-screen">
      <AppBar backHref="/catalog" />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <nav className="mb-3 text-sm text-slate-500">
          <Link href="/catalog">Каталог</Link>
          {f.parent ? (
            <>
              {" / "}
              <Link href={`/catalog/${f.parent.slug}`}>{f.parent.name}</Link>
            </>
          ) : null}
        </nav>
        <h1 className="mb-4 text-2xl font-black text-slate-800">{f.cat.name}</h1>
        {f.children.length ? (
          <ul className="mb-6 flex flex-wrap gap-2">
            {f.children.map((c) => (
              <li key={c.guid}>
                <Link href={`/catalog/${c.slug}`} className="inline-block rounded-full border border-slate-200 px-3 py-1 text-sm">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {products.map((p) => {
            const img = resolveImageUrl(p.images[0]?.path, 320);
            return (
              <li key={p.id}>
                <Link href={productPath(p)} className="block text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img ? <img src={img} alt={p.name} loading="lazy" className="mb-1 aspect-square w-full rounded-xl object-contain" /> : null}
                  {p.name}
                </Link>
              </li>
            );
          })}
        </ul>
        {seo?.text ? <RichText text={seo.text} className="mt-10" /> : null}
      </div>
    </main>
  );
}
