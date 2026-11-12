import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { productSearchWhere } from "@/lib/productSearch";
import { arrivalIds } from "./arrivalInfo";

/**
 * The product filters of the admin panel table (URL ?search=&category=&brand=&status=&photo=&desc=&seo=&stock=&label=),
 * shared by the table, «выбрать все по фильтру», bulk operations and the Excel export.
 */
export async function productWhere(sp: URLSearchParams): Promise<Prisma.ProductWhereInput> {
  const and: Prisma.ProductWhereInput[] = [];
  const ids = sp.get("ids");
  if (ids) and.push({ id: { in: ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) } });
  const search = sp.get("search")?.trim();
  if (search) and.push(productSearchWhere(search));
  const category = sp.get("category");
  if (category) {
    const kids = await prisma.category.findMany({ where: { OR: [{ parentGuid: category }, { parent: { parentGuid: category } }] }, select: { guid: true } });
    and.push({ categoryGuid: { in: [category, ...kids.map((k) => k.guid)] } });
  }
  const brand = sp.get("brand");
  if (brand === "none") and.push({ brandGuid: null });
  else if (brand) and.push({ brandGuid: brand });
  const status = sp.get("status") ?? (sp.get("hidden") === "1" ? "hidden" : sp.get("hidden") === "0" ? "visible" : null);
  if (status === "hidden") and.push({ hidden: true });
  if (status === "visible") and.push({ hidden: false });
  if (sp.get("photo") === "none") and.push({ images: { none: {} } });
  if (sp.get("photo") === "has") and.push({ images: { some: {} } });
  if (sp.get("desc") === "none") and.push({ OR: [{ description: null }, { description: "" }] });
  if (sp.get("seo") === "none") and.push({ OR: [{ seoTitle: null }, { seoTitle: "" }, { seoDescription: null }, { seoDescription: "" }] });
  if (sp.get("seo") === "manual") and.push({ seoSource: "manual" });
  if (sp.get("seo") === "template") and.push({ seoSource: "template" });
  if (sp.get("stock") === "in") and.push({ stock: { gt: 0 } });
  if (sp.get("stock") === "out") and.push({ OR: [{ stock: null }, { stock: { lte: 0 } }] });
  const label = sp.get("label");
  if (label === "new" || label === "hit") and.push({ labels: { has: label } });
  // automatic, by arrivals from 1С (lib/cms/arrivalInfo.ts)
  if (label === "arr_new" || label === "arr_back") and.push({ id: { in: await arrivalIds(label === "arr_new" ? "new" : "back") } });
  if (sp.get("override") === "1") and.push({ OR: [{ categoryManual: true }, { brandManual: true }, { descriptionManual: true }] });
  return and.length ? { AND: and } : {};
}

export const SORTS: Record<string, (dir: Prisma.SortOrder) => Prisma.ProductOrderByWithRelationInput[]> = {
  name: (d) => [{ name: d }],
  updated: (d) => [{ updatedAt: d }],
  created: (d) => [{ createdAt: d }],
  stock: (d) => [{ stock: { sort: d, nulls: "last" } }],
  sales: (d) => [{ salesCount: d }],
  article: (d) => [{ article: { sort: d, nulls: "last" } }],
  barcode: (d) => [{ barcode: { sort: d, nulls: "last" } }],
  brand: (d) => [{ brand: { name: d } }],
};

/** ids of every product the filter finds (for «all N by the filter»), at most `max` */
export async function productIdsByFilter(sp: URLSearchParams, max = 20000): Promise<number[]> {
  const where = await productWhere(sp);
  return (await prisma.product.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: max })).map((p) => p.id);
}
