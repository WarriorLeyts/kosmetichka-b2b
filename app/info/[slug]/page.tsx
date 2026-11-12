import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPageView } from "@/components/DocPageView";
import { publishedDoc } from "@/lib/cms/docs";
import { isBuiltinDoc } from "@/lib/cms/docSchema";

// pages added in the admin panel (Страницы → «Новая страница»): /info/<slug>, shown once published
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug) || isBuiltinDoc(slug)) return null;
  return publishedDoc(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await load(slug);
  if (!doc) return { title: "Страница не найдена" };
  return { title: doc.seoTitle || doc.title, description: doc.seoDescription || undefined, alternates: { canonical: `/info/${slug}` } };
}

export default async function CustomPage({ params }: Props) {
  const { slug } = await params;
  const doc = await load(slug);
  if (!doc) notFound();
  return <DocPageView doc={doc} slug={slug} />;
}
