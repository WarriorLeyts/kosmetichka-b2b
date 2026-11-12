import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/productSlug";
import { CATALOG_SETTINGS_KEY, readCatalogSettings, type CatalogSettings } from "./catalogSettingsSchema";
export * from "./catalogSettingsSchema";

/**
 * The catalog page, set in the admin panel (Каталог → Настройки), stored in CmsSetting «catalog»:
 *  - quick: the quick filters («Новинки», «Со скидкой», «Подарочные наборы») — names, order, shown or not;
 *  - categories: the order of the top categories, their pictures, hidden from the menu (the goods stay);
 *  - seo: title / description / text of the catalog page and of each category page (/catalog/<slug>).
 * Read by /api/mobile/catalog-meta (the apps), the catalog pages for search engines and the sitemap.
 */

let cache: { at: number; v: CatalogSettings } | null = null;
export async function getCatalogSettings(): Promise<CatalogSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  let raw: unknown = null;
  try {
    raw =
      (
        await prisma.cmsSetting.findUnique({
          where: { key: CATALOG_SETTINGS_KEY },
        })
      )?.value ?? null;
  } catch {
    raw = null;
  }
  const v = readCatalogSettings(raw);
  cache = { at: Date.now(), v };
  return v;
}
export function resetCatalogSettingsCache() {
  cache = null;
}

type Cat = {
  guid: string;
  name: string;
  sortOrder: number;
  parentGuid: string | null;
};

/** categories in the admin panel's order: the listed ones first, then the rest by their 1С order */
export function orderCategories<T extends Cat>(cats: T[], s: Pick<CatalogSettings, "categories">): T[] {
  const pos = new Map(s.categories.order.map((g, i) => [g, i]));
  return [...cats].sort((a, b) => (pos.get(a.guid) ?? 1e6 + a.sortOrder) - (pos.get(b.guid) ?? 1e6 + b.sortOrder) || a.name.localeCompare(b.name, "ru"));
}

/** a stable address for each category page: /catalog/<slug> (the same name twice — the second gets a piece of its guid) */
export function categorySlugs(cats: { guid: string; name: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const c of [...cats].sort((a, b) => a.guid.localeCompare(b.guid))) {
    let s = slugify(c.name) || "kategoriya";
    if (used.has(s))
      s = `${s}-${c.guid
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 6)
        .toLowerCase()}`;
    used.add(s);
    out.set(c.guid, s);
  }
  return out;
}
