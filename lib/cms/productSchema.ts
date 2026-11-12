import { z } from "zod";

/** Fields of a product that the admin panel edits. Name, article, prices and stock come from 1C. */
export const productPatchSchema = z
  .object({
    description: z.string().max(20000).nullable(),
    specs: z
      .array(z.object({ name: z.string().trim().min(1, "Название характеристики").max(80), value: z.string().trim().min(1, "Значение").max(300) }))
      .max(40),
    seoTitle: z.string().trim().max(120).nullable(),
    seoDescription: z.string().trim().max(300).nullable(),
    hidden: z.boolean(),
    relatedIds: z.array(z.number().int().positive()).max(24),
    /** the description returns to 1C: the next import overwrites it again */
    descriptionFrom1C: z.boolean(),
  })
  .partial();

export type ProductPatch = z.infer<typeof productPatchSchema>;

export const PRICE_LABELS: Record<string, string> = {
  retail: "Розница",
  discount: "Скидка",
  wholesale: "Опт",
  big_wholesale: "Крупный опт",
};
