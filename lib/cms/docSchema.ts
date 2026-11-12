import { z } from "zod";

/**
 * Document pages edited in the admin panel (Страницы): «Контакты», «Политика конфиденциальности»,
 * «Пользовательское соглашение» and the pages the shop adds (/info/<slug>). No database here — the browser
 * code of the panel uses it too. Stored in SitePage «doc:<slug>» (draft → publish, versions).
 */
export const BUILTIN_DOCS = {
  contacts: { path: "/contacts", name: "Контакты и реквизиты" },
  privacy: { path: "/privacy", name: "Политика конфиденциальности" },
  agreement: { path: "/agreement", name: "Пользовательское соглашение" },
} as const;
export type BuiltinDoc = keyof typeof BUILTIN_DOCS;
export const isBuiltinDoc = (s: string): s is BuiltinDoc => s in BUILTIN_DOCS;

/** addresses a new page may not take (site sections and the built-in pages) */
export const RESERVED_SLUGS = new Set([...Object.keys(BUILTIN_DOCS), "new", "admin", "api", "catalog", "product", "page", "info"]);

export const docSlugSchema = z
  .string()
  .trim()
  .min(2, "Адрес — минимум 2 символа")
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Адрес: латиница, цифры и дефис (например, dostavka-i-oplata)");

const row = z.object({ label: z.string().trim().max(80), value: z.string().trim().max(400) });

export const docContentSchema = z.object({
  title: z.string().trim().min(1, "Заголовок пустой").max(150),
  /** the text: «## » heading, «- » list, «1. » numbered list, **bold**, [text](link) */
  body: z.string().max(100_000).default(""),
  /** key–value tables before the text (requisites, bank, phones…) */
  groups: z.array(z.object({ title: z.string().trim().max(120), rows: z.array(row).max(40) })).max(10).default([]),
  seoTitle: z.string().trim().max(120).default(""),
  seoDescription: z.string().trim().max(300).default(""),
  /** a link in the app's «О компании» and at the bottom of the site's pages */
  showInMenu: z.boolean().default(true),
  menuTitle: z.string().trim().max(60).default(""),
});
export type DocContent = z.infer<typeof docContentSchema>;

export const docKey = (slug: string) => `doc:${slug}`;
export const docPath = (slug: string) => (isBuiltinDoc(slug) ? BUILTIN_DOCS[slug].path : `/info/${slug}`);
