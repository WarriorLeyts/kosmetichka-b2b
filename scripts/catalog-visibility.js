/** Shared by the storefront and 1C restock notifications. Rules survive all catalogue imports. */
export const HIDDEN_BRAND_PREFIX = "catalog:hidden-brand:";
export const ANGIOPHARM_ID = "angiopharm";
export const ANGIOPHARM_NAMES = ["ангиофарм", "ангио фарм", "ангио-фарм", "angiopharm", "angio pharm", "angio-pharm"];
export function isAngiopharm(value) {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-zа-яё0-9]/g, "");
  return normalized.includes("ангиофарм") || normalized.includes("angiopharm");
}
export function angiopharmWhere() {
  return { OR: ANGIOPHARM_NAMES.flatMap(name => [
    { name: { contains: name, mode: "insensitive" } },
    { brand: { is: { name: { contains: name, mode: "insensitive" } } } },
  ]) };
}
export function brandVisibilityWhere(ids) {
  const guids = ids.filter(id => id !== ANGIOPHARM_ID);
  const rules = [];
  // NOT EXISTS on the relation also keeps products without a brand (SQL NULL must not hide them).
  if (guids.length) rules.push({ brand: { is: { guid: { in: guids } } } });
  if (ids.includes(ANGIOPHARM_ID)) rules.push(angiopharmWhere());
  return rules.length ? { NOT: { OR: rules } } : {};
}
export async function readHiddenBrands(db) {
  const rows = await db.cmsSetting.findMany({ where: { key: { startsWith: HIDDEN_BRAND_PREFIX } }, select: { key: true } });
  return rows.map(row => row.key.slice(HIDDEN_BRAND_PREFIX.length)).filter(Boolean);
}
export function productExcluded(product, ids) {
  return ids.includes(product.brandGuid) || (ids.includes(ANGIOPHARM_ID) && (isAngiopharm(product.name) || isAngiopharm(product.brand?.name)));
}

/** Products without an attached photo are staff-only; order snapshots are deliberately separate. */
export function catalogPhotoWhere(staff = false) {
  return staff ? {} : { images: { some: { path: { not: "" } } } };
}
export function hasCatalogPhoto(product) {
  return Array.isArray(product.images) && product.images.some(image => typeof image.path === "string" && image.path.trim().length > 0);
}
