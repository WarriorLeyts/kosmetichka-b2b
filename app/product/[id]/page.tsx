import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { parseProductParam, productPath } from "@/lib/productSlug";
import { prisma } from "@/lib/prisma";
import { ProductPageClient } from "@/components/catalog/ProductPageClient";
import { withFlatPrices } from "@/lib/utils";
import type { Metadata } from "next";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Cached per-request DB fetch — React deduplicates identical calls within
 * the same render pass, so generateMetadata and the page component share
 * one DB round-trip instead of two.
 */
const getProduct = cache(async (id: number) => {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      brand: true,
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      prices: true,
      variants: {
        include: { image: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const parsed = parseProductParam(id);
  const product = parsed ? await getProduct(parsed.id) : null;

  if (!product || product.hidden) return {};

  // SEO-поля из админ-панели (admin.kosmetichka-opt.ru) важнее автоматических; свой Title — без «| Косметичка» сверху
  const title = product.seoTitle?.trim() ? { absolute: product.seoTitle.trim() } : product.name;
  const ogTitle = product.seoTitle?.trim() || product.name;
  const plain = product.description
    ? product.description
        .replace(/[*_`#>~]+/g, "")
        .replace(/^\s*[-•]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const description = product.seoDescription?.trim()
    ? product.seoDescription.trim()
    : product.shortDescription?.trim()
    ? product.shortDescription.trim().slice(0, 160)
    : plain
    ? plain.length > 160 ? plain.slice(0, 157).replace(/\s+\S*$/, "") + "…" : plain
    : `Купить ${product.name} оптом в магазине Косметичка. Выгодные цены.`;
  const imageUrl = product.images[0]?.path
    ? product.images[0].path.startsWith("http")
      ? product.images[0].path
      : `https://kosmetichka-opt.ru/api/1c/${product.images[0].path}`
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: product.canonicalUrl?.trim() || productPath(product) },
    openGraph: {
      title: ogTitle,
      description,
      url: `https://kosmetichka-opt.ru${productPath(product)}`,
      type: "website",
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  // /product/12 и /product/12-shampun-fino — один товар; ключ — id, текст после него — ЧПУ
  const parsed = parseProductParam(id);
  if (!parsed) notFound();
  // getProduct is memoised by React.cache — no second DB hit if generateMetadata ran first
  const product = await getProduct(parsed.id);

  // скрытый в админ-панели товар покупателям не показываем
  if (!product || product.hidden) {
    notFound();
  }
  // старый или чужой ЧПУ — на правильный адрес (одна страница для поисковиков)
  if ((product.slug ?? null) !== parsed.slug) permanentRedirect(productPath(product));

  const relatedProducts = product.brandGuid
    ? await prisma.product.findMany({
        where: { brandGuid: product.brandGuid, id: { not: product.id }, hidden: false },
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
            url: `https://kosmetichka-opt.ru${productPath(product)}`,
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
        // «</script>» inside a product name or description would end the script tag early
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ProductPageClient
        product={withFlatPrices(product)}
        relatedProducts={relatedProducts.map(withFlatPrices)}
      />
      <ProductSections product={product} />
    </>
  );
}

/** Разделы карточки из админ-панели (краткое описание, особенности, применение, состав…) — текстом на странице */
function ProductSections({
  product,
}: {
  product: {
    shortDescription: string | null;
    features: string | null;
    usage: string | null;
    composition: string | null;
    skinType: string | null;
    country: string | null;
    specs: unknown;
  };
}) {
  const sections = (
    [
      ["Кратко", product.shortDescription],
      ["Особенности и преимущества", product.features],
      ["Способ применения", product.usage],
      ["Состав", product.composition],
    ] as const
  ).filter(([, v]) => v?.trim());
  const specs = [
    ...(product.skinType ? [{ name: "Тип кожи / волос", value: product.skinType }] : []),
    ...(product.country ? [{ name: "Страна производства", value: product.country }] : []),
    ...(Array.isArray(product.specs) ? (product.specs as { name: string; value: string }[]) : []),
  ];
  if (!sections.length && !specs.length) return null;
  return (
    <section className="mx-auto max-w-5xl space-y-5 px-4 pb-24 pt-2 text-[15px] leading-relaxed">
      {sections.map(([title, text]) => (
        <div key={title}>
          <h2 className="mb-1 text-lg font-semibold">{title}</h2>
          <p className="whitespace-pre-line">{text}</p>
        </div>
      ))}
      {specs.length ? (
        <div>
          <h2 className="mb-1 text-lg font-semibold">Характеристики</h2>
          <dl className="grid grid-cols-[minmax(0,14rem)_1fr] gap-x-4 gap-y-1">
            {specs.map((s, i) => (
              <div key={i} className="contents">
                <dt className="text-slate-500">{s.name}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
