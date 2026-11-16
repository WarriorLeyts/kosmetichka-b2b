import { z } from "zod";
import { prisma } from "./prisma";

export const assortmentSchema = z.object({
  enabled: z.boolean().optional(),
  variants: z.array(z.object({
    imageId: z.number().int().positive(),
    name: z.string().trim().max(120),
    available: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })).max(60),
}).superRefine(({ variants }, ctx) => {
  if (new Set(variants.map(v => v.imageId)).size !== variants.length)
    ctx.addIssue({ code: "custom", message: "Одно фото можно выбрать только один раз" });
  const names = variants.map((v, i) => (v.name || `Вариант ${i + 1}`).toLocaleLowerCase("ru"));
  if (new Set(names).size !== names.length)
    ctx.addIssue({ code: "custom", message: "Названия вариантов должны различаться" });
});

export function variantImageUrl(path: string) {
  return path.startsWith("http") ? path : `https://kosmetichka-opt.ru/api/1c/${path}`;
}

export async function getAssortment(productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: {
    assortmentEnabled: true,
    images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    variants: { include: { image: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  } });
  if (!product) return null;
  return { enabled: product.assortmentEnabled,
    images: product.images.map(i => ({ id: i.id, path: i.path, url: variantImageUrl(i.path) })),
    variants: product.variants.map(v => ({ id: v.id, imageId: v.imageId, name: v.name, available: v.available, sortOrder: v.sortOrder, imageUrl: variantImageUrl(v.image.path) })),
  };
}

/** Stable variant IDs preserve carts when staff rename/reorder variants. All photos must belong to this product. */
export async function saveAssortment(productId: number, input: z.infer<typeof assortmentSchema>) {
  await prisma.$transaction(async tx => {
    const p = await tx.product.findUnique({ where: { id: productId }, select: { id: true, images: { select: { id: true } }, variants: true } });
    if (!p) throw new Error("Товар не найден");
    if (input.variants.some(v => !p.images.some(i => i.id === v.imageId))) throw new Error("Фото не принадлежит этому товару");
    const enabled = input.enabled ?? input.variants.length > 0;
    if (enabled && !input.variants.length) throw new Error("Выберите хотя бы одно фото варианта");
    // Updating the product serializes concurrent saves of the same card.
    await tx.product.update({ where: { id: productId }, data: { assortmentEnabled: enabled } });
    await tx.productVariant.deleteMany({ where: { productId, imageId: { notIn: input.variants.map(v => v.imageId) } } });
    for (const [i, v] of input.variants.entries()) {
      const data = { name: v.name || `Вариант ${i + 1}`, available: v.available, sortOrder: v.sortOrder ?? i };
      const existing = p.variants.find(x => x.imageId === v.imageId);
      if (existing) await tx.productVariant.update({ where: { id: existing.id }, data });
      else await tx.productVariant.create({ data: { productId, imageId: v.imageId, ...data } });
    }
  }, { isolationLevel: "Serializable" });
  return getAssortment(productId);
}
