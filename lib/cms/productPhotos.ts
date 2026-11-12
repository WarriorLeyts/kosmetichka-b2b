import { prisma } from "@/lib/prisma";
import { saveImageWithOriginal } from "./upload";
import { revalidatePath } from "next/cache";
export { articleKey, parsePhotoName } from "./photoNames";

/** Adds pictures to the end of a product's gallery (or replaces its gallery). Returns how many were added. */
export async function addProductPhotos(productId: number, files: Buffer[], mode: "add" | "replace" = "add"): Promise<number> {
  const paths: { path: string; original: string | null }[] = [];
  for (const f of files) paths.push(await saveImageWithOriginal(f, "products", 2000));
  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      // photos a variant («оттенок») points at stay — the variant would lose its picture
      await tx.productImage.deleteMany({ where: { productId, variants: { none: {} } } });
    }
    const last = await tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
    let order = (last._max.sortOrder ?? -1) + 1;
    for (const p of paths) await tx.productImage.create({ data: { productId, path: p.path, original: p.original, sortOrder: order++ } });
  });
  // в фоновой задаче (не в запросе) у Next нет контекста для revalidatePath — страница товара
  // всё равно рендерится на каждый запрос, кэш здесь не обязателен
  try {
    revalidatePath(`/product/${productId}`);
  } catch {
    /* вне запроса */
  }
  return paths.length;
}

