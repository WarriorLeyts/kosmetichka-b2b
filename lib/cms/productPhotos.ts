import { prisma } from "@/lib/prisma";
import { saveImage } from "./upload";
import { revalidatePath } from "next/cache";
export { articleKey, parsePhotoName } from "./photoNames";

/** Adds pictures to the end of a product's gallery (or replaces its gallery). Returns how many were added. */
export async function addProductPhotos(productId: number, files: Buffer[], mode: "add" | "replace" = "add"): Promise<number> {
  const paths: string[] = [];
  for (const f of files) paths.push(await saveImage(f, "products", 2000));
  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      // photos a variant («оттенок») points at stay — the variant would lose its picture
      await tx.productImage.deleteMany({ where: { productId, variants: { none: {} } } });
    }
    const last = await tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
    let order = (last._max.sortOrder ?? -1) + 1;
    for (const path of paths) await tx.productImage.create({ data: { productId, path, sortOrder: order++ } });
  });
  revalidatePath(`/product/${productId}`);
  return paths.length;
}

