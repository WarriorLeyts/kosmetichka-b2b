import { z } from "zod";
import { isValidSlug } from "@/lib/productSlug";

const text = (max: number) => z.string().max(max).nullable();
const line = (max: number) => z.string().trim().max(max).nullable();

/**
 * Fields of a product the admin panel edits («данные сайта»). From 1C and read-only here: name, article,
 * barcode, prices, stock. Category and brand can be changed — then 1C no longer overwrites them
 * (the 1C values stay in categoryGuid1C / brandGuid1C, «Вернуть из 1С» puts them back).
 */
export const productPatchSchema = z
  .object({
    description: text(20000),
    shortDescription: text(1000),
    features: text(5000),
    usage: text(5000),
    composition: text(5000),
    skinType: line(200),
    country: line(100),
    specs: z
      .array(z.object({ name: z.string().trim().min(1, "Название характеристики").max(80), value: z.string().trim().min(1, "Значение").max(300) }))
      .max(40),
    seoTitle: line(120),
    seoDescription: line(300),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .max(80)
      .refine((v) => v === "" || isValidSlug(v), "ЧПУ: только латиница, цифры и дефисы")
      .nullable(),
    canonicalUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || /^https:\/\/kosmetichka-opt\.ru\/[^\s]*$/.test(v) || /^\/[^\s/][^\s]*$/.test(v), "Canonical: адрес на kosmetichka-opt.ru (https://kosmetichka-opt.ru/… или /…)")
      .nullable(),
    hidden: z.boolean(),
    labels: z.array(z.enum(["new", "hit"])).max(2),
    relatedIds: z.array(z.number().int().positive()).max(24),
    categoryGuid: z.string().min(1).max(80),
    brandGuid: z.string().min(1).max(80).nullable(),
    /** back to 1C: the next import overwrites it again / the 1C value right away */
    descriptionFrom1C: z.boolean(),
    categoryFrom1C: z.boolean(),
    brandFrom1C: z.boolean(),
    imageAlts: z.array(z.object({ id: z.number().int().positive(), alt: z.string().trim().max(200) })).max(60),
  })
  .partial();

export type ProductPatch = z.infer<typeof productPatchSchema>;

export const PRICE_LABELS: Record<string, string> = {
  retail: "Розница",
  discount: "Скидка",
  wholesale: "Опт",
  big_wholesale: "Крупный опт",
};

export const LABELS: Record<string, string> = { new: "Новинка", hit: "Хит" };

/** the marketing sections of the card, in the order they are shown */
export const SECTIONS = [
  ["shortDescription", "Краткое описание", 1000],
  ["features", "Особенности и преимущества", 5000],
  ["usage", "Способ применения", 5000],
  ["composition", "Состав", 5000],
] as const;
