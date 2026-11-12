/**
 * Product addresses for people and search engines: /product/<id>-<slug>. The id stays the key
 * (1С guid ↔ id in the base), the slug is only text: an old or wrong slug still opens the product
 * and redirects to the right address. Shared by the site, the admin panel and the app.
 */
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** «Шампунь Fino 70мл/36» → «shampun-fino-70ml-36» (≤ 80 chars, latin, digits, hyphens) */
export function slugify(text: string): string {
  const out = [...text.toLowerCase()]
    .map((c) => (c in MAP ? MAP[c] : /[a-z0-9]/.test(c) ? c : "-"))
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out.slice(0, 80).replace(/-[^-]*$/, (m) => (out.length > 80 ? "" : m)).replace(/-$/, "");
}

export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80;
}

/** /product/12 or /product/12-shampun-fino */
export function productPath(p: { id: number; slug?: string | null }): string {
  return p.slug ? `/product/${p.id}-${p.slug}` : `/product/${p.id}`;
}

/** «12-shampun-fino» → { id: 12, slug: "shampun-fino" }; «12» → { id: 12, slug: null }; junk → null */
export function parseProductParam(param: string): { id: number; slug: string | null } | null {
  const m = String(param).match(/^(\d{1,10})(?:-([a-z0-9-]+))?\/?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return id > 0 ? { id, slug: m[2] ?? null } : null;
}
