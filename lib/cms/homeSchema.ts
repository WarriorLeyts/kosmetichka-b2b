import { z } from "zod";

/**
 * Blocks of the storefront home page, edited in the admin panel (admin.kosmetichka-opt.ru → «Главная»).
 * Shared by the editor (browser) and the server: no server-only imports here.
 */

/** «/catalog?…», «/product/12» or https://… — never javascript: and the like */
export const linkSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\/[^\s]+$/i.test(v), {
    message: "Ссылка должна начинаться с «/» (страница сайта) или с https://",
  });

/** a picture uploaded through the admin panel */
export const imagePathSchema = z
  .string()
  .regex(/^uploads\/(banners|pages|products)\/[\w.-]+\.webp$/, "Загрузите изображение через панель");

const base = {
  id: z.string().min(1).max(40),
  visible: z.boolean().default(true),
};
const title = z.string().trim().max(120);

export const heroBlock = z.object({
  ...base,
  type: z.literal("hero"),
  bannerIds: z.array(z.number().int().positive()).max(12),
  intervalSec: z.number().int().min(2).max(30).default(6),
});

export const categoriesBlock = z.object({
  ...base,
  type: z.literal("categories"),
  title,
  /** chosen categories in this order; empty — the main categories automatically */
  categoryGuids: z.array(z.string().min(1).max(80)).max(24),
  limit: z.number().int().min(1).max(24).default(12),
});

export const PRODUCT_SOURCES = {
  new: "Новинки — впервые пришли в компанию (срок — в Настройках)",
  back: "Снова в наличии — пришли повторно (срок — в Настройках)",
  hits: "Хиты продаж",
  sale: "Акции — товары со скидкой",
  gift: "Подарочные наборы",
  category: "Товары категории",
  manual: "Выбранные вручную",
} as const;

export const productsBlock = z.object({
  ...base,
  type: z.literal("products"),
  title,
  source: z.enum(Object.keys(PRODUCT_SOURCES) as [keyof typeof PRODUCT_SOURCES, ...(keyof typeof PRODUCT_SOURCES)[]]),
  categoryGuid: z.string().max(80).optional(),
  productIds: z.array(z.number().int().positive()).max(40).default([]),
  limit: z.number().int().min(2).max(24).default(12),
  moreText: z.string().trim().max(40).default("Все"),
  moreLink: linkSchema.default(""),
});

export const infoBlock = z.object({
  ...base,
  type: z.literal("info"),
  title,
  text: z.string().trim().max(2000).default(""),
  image: imagePathSchema.or(z.literal("")).default(""),
  buttonText: z.string().trim().max(40).default(""),
  link: linkSchema.default(""),
  tone: z.enum(["light", "accent"]).default("light"),
});

export const buttonsBlock = z.object({
  ...base,
  type: z.literal("buttons"),
  title: title.default(""),
  items: z
    .array(z.object({ label: z.string().trim().min(1, "Текст кнопки").max(60), link: linkSchema.refine((v) => v !== "", "Укажите ссылку") }))
    .min(1)
    .max(8),
});

export const blockSchema = z.discriminatedUnion("type", [heroBlock, categoriesBlock, productsBlock, infoBlock, buttonsBlock]);
export type HomeBlock = z.infer<typeof blockSchema>;
export type BlockType = HomeBlock["type"];

export const pageContentSchema = z
  .object({
    version: z.literal(1),
    blocks: z.array(blockSchema).max(40),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.blocks.forEach((b, i) => {
      if (ids.has(b.id)) ctx.addIssue({ code: "custom", path: ["blocks", i, "id"], message: "Повторяется id блока" });
      ids.add(b.id);
      if (b.type === "products" && b.source === "manual" && b.productIds.length === 0)
        ctx.addIssue({ code: "custom", path: ["blocks", i, "productIds"], message: `«${b.title || "Подборка"}»: выберите товары` });
      if (b.type === "products" && b.source === "category" && !b.categoryGuid)
        ctx.addIssue({ code: "custom", path: ["blocks", i, "categoryGuid"], message: `«${b.title || "Подборка"}»: выберите категорию` });
    });
  });
export type PageContent = z.infer<typeof pageContentSchema>;

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Баннеры (слайдер)",
  categories: "Категории",
  products: "Подборка товаров",
  info: "Информационный блок",
  buttons: "Кнопки и ссылки",
};

export function newBlockId() {
  return Math.random().toString(36).slice(2, 10);
}

export function newBlock(type: BlockType): HomeBlock {
  const id = newBlockId();
  switch (type) {
    case "hero":
      return { id, visible: true, type, bannerIds: [], intervalSec: 6 };
    case "categories":
      return { id, visible: true, type, title: "Категории", categoryGuids: [], limit: 12 };
    case "products":
      return { id, visible: true, type, title: "Новинки", source: "new", productIds: [], limit: 12, moreText: "Все", moreLink: "/catalog?quick=new" };
    case "info":
      return { id, visible: true, type, title: "Заголовок", text: "", image: "", buttonText: "", link: "", tone: "light" };
    case "buttons":
      return { id, visible: true, type, title: "", items: [{ label: "Каталог", link: "/catalog" }] };
  }
}

/** What the home page shows before anything is published — the same as the current home */
export const DEFAULT_HOME: PageContent = {
  version: 1,
  blocks: [
    { id: "hero", visible: true, type: "hero", bannerIds: [], intervalSec: 6 },
    { id: "cats", visible: true, type: "categories", title: "Категории", categoryGuids: [], limit: 12 },
    { id: "new", visible: true, type: "products", title: "Новинки", source: "new", productIds: [], limit: 24, moreText: "Все", moreLink: "/catalog?quick=new" },
    { id: "back", visible: true, type: "products", title: "Снова в наличии", source: "back", productIds: [], limit: 24, moreText: "", moreLink: "" },
  ],
};
