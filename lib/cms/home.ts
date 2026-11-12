import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { resolveImageUrl } from "@/lib/image";
import { DEFAULT_HOME, pageContentSchema, type HomeBlock, type PageContent } from "./homeSchema";

export const HOME_KEY = "home";

/** The home page row (created with the current home layout on first use). */
export async function getHomePage() {
  const found = await prisma.sitePage.findUnique({ where: { key: HOME_KEY } });
  if (found) return found;
  return prisma.sitePage.upsert({
    where: { key: HOME_KEY },
    update: {},
    create: { key: HOME_KEY, title: "Главная страница", draft: DEFAULT_HOME as unknown as Prisma.InputJsonValue },
  });
}

/** Stored JSON → valid content (a broken / old value falls back to the default instead of failing the page). */
export function readContent(raw: unknown): PageContent {
  const r = pageContentSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_HOME;
}

export type ResolvedBanner = {
  id: number;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  link: string | null;
  imageDesktop: string | null;
  imageMobile: string | null;
};

export type PreviewProduct = { id: number; name: string; image: string | null; price: number | null };

/** What the apps get for one block: the block itself + the data it needs. */
export type ResolvedBlock =
  | (Extract<HomeBlock, { type: "hero" }> & { banners: ResolvedBanner[] })
  | (Extract<HomeBlock, { type: "categories" }> & { categories: { guid: string; name: string }[] | null; auto?: boolean })
  | (Extract<HomeBlock, { type: "products" }> & {
      /** the catalogue request that lists the block's products (GET /api/catalog/products) */
      query: { quick?: string[]; sort?: string; categoryGuid?: string; ids?: number[]; onlyStock?: boolean };
      preview?: PreviewProduct[];
    })
  | (Extract<HomeBlock, { type: "info" }> & { imageUrl: string | null })
  | Extract<HomeBlock, { type: "buttons" }>;

const bannerUrl = (p: string | null) => (p ? resolveImageUrl(p) : null);

/**
 * Blocks → what the storefront needs to draw them. Hidden blocks are left out, banners that are
 * switched off / out of their dates / deleted are left out, hidden products are left out.
 * `withPreview` adds a few product cards per block (for the editor's preview).
 */
export async function resolveBlocks(content: PageContent, opts: { withPreview?: boolean; now?: Date; keepEmpty?: boolean } = {}): Promise<ResolvedBlock[]> {
  const now = opts.now ?? new Date();
  const blocks = content.blocks.filter((b) => b.visible);

  const bannerIds = [...new Set(blocks.flatMap((b) => (b.type === "hero" ? b.bannerIds : [])))];
  const banners = bannerIds.length
    ? await prisma.banner.findMany({
        where: {
          id: { in: bannerIds },
          active: true,
          deletedAt: null,
          AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
      })
    : [];
  const bannerById = new Map(banners.map((b) => [b.id, b]));

  const catGuids = [...new Set(blocks.flatMap((b) => (b.type === "categories" ? b.categoryGuids : [])))];
  const cats = catGuids.length ? await prisma.category.findMany({ where: { guid: { in: catGuids } }, select: { guid: true, name: true } }) : [];
  const catByGuid = new Map(cats.map((c) => [c.guid, c]));

  const manualIds = [...new Set(blocks.flatMap((b) => (b.type === "products" && b.source === "manual" ? b.productIds : [])))];
  const visibleManual = manualIds.length
    ? new Set((await prisma.product.findMany({ where: { id: { in: manualIds }, hidden: false }, select: { id: true } })).map((p) => p.id))
    : new Set<number>();

  // предпросмотр: «основные категории автоматически» — показываем, какие именно (как в приложении)
  let autoCats: { guid: string; name: string }[] = [];
  if (opts.keepEmpty && blocks.some((b) => b.type === "categories" && !b.categoryGuids.length)) {
    const root = await prisma.category.findFirst({ where: { name: { equals: "Каталог", mode: "insensitive" } }, select: { guid: true } });
    autoCats = await prisma.category.findMany({ where: root ? { parentGuid: root.guid } : { parentGuid: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { guid: true, name: true } });
  }

  const out: ResolvedBlock[] = [];
  for (const b of blocks) {
    if (b.type === "hero") {
      const list = b.bannerIds
        .map((id) => bannerById.get(id))
        .filter((x): x is NonNullable<typeof x> => !!x && !!(x.imageDesktop || x.imageMobile))
        .map((x) => ({
          id: x.id,
          title: x.title,
          subtitle: x.subtitle,
          buttonText: x.buttonText,
          link: x.link,
          imageDesktop: bannerUrl(x.imageDesktop ?? x.imageMobile),
          imageMobile: bannerUrl(x.imageMobile ?? x.imageDesktop),
        }));
      if (list.length || opts.keepEmpty) out.push({ ...b, banners: list });
    } else if (b.type === "categories") {
      const list = b.categoryGuids.map((g) => catByGuid.get(g)).filter((x): x is { guid: string; name: string } => !!x);
      if (b.categoryGuids.length) out.push({ ...b, categories: list.slice(0, b.limit) });
      else out.push({ ...b, categories: opts.keepEmpty ? autoCats.slice(0, b.limit) : null, auto: true });
    } else if (b.type === "products") {
      const query: Extract<ResolvedBlock, { type: "products" }>["query"] =
        b.source === "new"
          ? { quick: ["new"], onlyStock: true }
          : b.source === "sale"
            ? { quick: ["sale"], onlyStock: true }
            : b.source === "gift"
              ? { quick: ["gift"], onlyStock: true }
              : b.source === "hits"
                ? { sort: "popularity", onlyStock: true }
                : b.source === "category"
                  ? { categoryGuid: b.categoryGuid, onlyStock: true }
                  : { ids: b.productIds.filter((id) => visibleManual.has(id)) };
      if (b.source === "manual" && !query.ids?.length && !opts.keepEmpty) continue;
      out.push({ ...b, query });
    } else if (b.type === "info") {
      out.push({ ...b, imageUrl: b.image ? resolveImageUrl(b.image) : null });
    } else {
      out.push(b);
    }
  }

  if (opts.withPreview) {
    for (const b of out) if (b.type === "products") b.preview = await previewProducts(b);
  }
  return out;
}

async function previewProducts(b: Extract<ResolvedBlock, { type: "products" }>): Promise<PreviewProduct[]> {
  const q = b.query;
  const newSince = new Date(Date.now() - 30 * 86400_000);
  const where: Prisma.ProductWhereInput = {
    hidden: false,
    ...(q.onlyStock ? { stock: { gt: 0 } } : {}),
    ...(q.ids ? { id: { in: q.ids } } : {}),
    ...(q.categoryGuid ? { categoryGuid: q.categoryGuid } : {}),
    ...(q.quick?.includes("new") ? { createdAt: { gte: newSince } } : {}),
    ...(q.quick?.includes("sale") ? { hasDiscount: true } : {}),
    ...(q.quick?.includes("gift") ? { name: { contains: "Подарок", mode: "insensitive" } } : {}),
  };
  const rows = await prisma.product.findMany({
    where,
    take: Math.min(b.limit, 12),
    orderBy: q.sort === "popularity" ? [{ salesCount: "desc" }] : [{ createdAt: "desc" }],
    select: { id: true, name: true, images: { take: 1, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { path: true } }, prices: { where: { priceType: "retail" }, select: { price: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = q.ids ? q.ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r) : rows;
  return ordered.map((r) => ({ id: r.id, name: r.name, image: resolveImageUrl(r.images[0]?.path, 320), price: r.prices[0]?.price ?? null }));
}
