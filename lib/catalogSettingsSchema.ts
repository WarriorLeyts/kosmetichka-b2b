import { z } from "zod";

/**
 * The catalog page settings (admin panel → Каталог), shared by the server and the panel's browser code
 * (no database here). Server side: lib/catalogSettings.ts.
 */
export const CATALOG_SETTINGS_KEY = "catalog";

export const QUICK_KEYS = ["new", "sale", "gift"] as const;
export const QUICK_DEFAULTS: Record<(typeof QUICK_KEYS)[number], string> = {
  new: "Новинки",
  sale: "Со скидкой",
  gift: "Подарочные наборы",
};

const image = z.string().regex(/^uploads\/(banners|pages|products)\/[\w.-]+\.webp$/, "Загрузите изображение через панель");
const seo = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(300).default(""),
  /** the text under the list for search engines (markdown: **bold**, «- » lists, «## » headings) */
  text: z.string().trim().max(6000).default(""),
});

export const catalogSettingsSchema = z.object({
  quick: z
    .array(
      z.object({
        key: z.enum(QUICK_KEYS),
        label: z.string().trim().min(1, "Название фильтра пустое").max(40),
        visible: z.boolean(),
      }),
    )
    .max(QUICK_KEYS.length)
    .default([]),
  /** show the quick filters as chips above the goods in the catalog */
  quickChips: z.boolean().default(true),
  categories: z
    .object({
      /** top categories in this order (the others after them, as 1С has them) */
      order: z.array(z.string().max(80)).max(200).default([]),
      hidden: z.array(z.string().max(80)).max(200).default([]),
      images: z.record(z.string().max(80), image).default({}),
    })
    .default({ order: [], hidden: [], images: {} }),
  seo: z
    .object({
      catalog: seo.default({ title: "", description: "", text: "" }),
      categories: z.record(z.string().max(80), seo).default({}),
    })
    .default({
      catalog: { title: "", description: "", text: "" },
      categories: {},
    }),
});
export type CatalogSettings = z.infer<typeof catalogSettingsSchema>;

/** every quick filter once, in the saved order, new ones (not saved yet) at the end */
export function quickFilters(s: Pick<CatalogSettings, "quick">) {
  const out = s.quick.filter((q, i, a) => a.findIndex((x) => x.key === q.key) === i);
  for (const key of QUICK_KEYS) if (!out.some((q) => q.key === key)) out.push({ key, label: QUICK_DEFAULTS[key], visible: true });
  return out;
}

export function readCatalogSettings(raw: unknown): CatalogSettings {
  const r = catalogSettingsSchema.safeParse(raw ?? {});
  const s = r.success ? r.data : catalogSettingsSchema.parse({});
  return { ...s, quick: quickFilters(s) };
}
