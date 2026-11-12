/**
 * SEO templates of the admin panel («Массовое SEO»): «{name} — купить оптом | Косметичка».
 * Variables come from the product card. Pure functions: used by the editor (preview) and the server.
 */
export const SEO_VARS = {
  name: "Название товара",
  brand: "Бренд",
  category: "Категория",
  article: "Артикул",
  price: "Цена (розница), ₽",
  country: "Страна производства",
} as const;
export type SeoVar = keyof typeof SEO_VARS;
export type SeoProduct = Partial<Record<SeoVar, string | number | null | undefined>>;

export const SEO_LIMITS = { title: { min: 20, max: 70 }, description: { min: 70, max: 160 } };

export const DEFAULT_TEMPLATES = {
  title: "{name} — купить оптом | Косметичка",
  description: "Купить {name}[ бренда {brand}] оптом в интернет-магазине Косметичка. Актуальные цены и ассортимент.",
  shortDescription: "{name}[ от бренда {brand}]. В наличии в интернет-магазине Косметичка.",
};

/**
 * Fills {var}. A part in [ ] is left out when a variable inside it is empty: «[ бренда {brand}]».
 * Spaces are tidied, «—» or «|» left dangling at the ends are removed.
 */
export function renderTemplate(tpl: string, p: SeoProduct): string {
  const val = (k: string) => {
    const v = p[k as SeoVar];
    if (v == null || v === "") return "";
    return typeof v === "number" ? v.toLocaleString("ru-RU") : String(v).trim();
  };
  let s = tpl.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    const vars = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return vars.every((v) => val(v)) ? inner : "";
  });
  s = s.replace(/\{(\w+)\}/g, (_, k: string) => val(k));
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^[\s—|,-]+|[\s—|,-]+$/g, "")
    .trim();
}

export function unknownVars(tpl: string): string[] {
  return [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !(v in SEO_VARS));
}

/** cut at a word boundary to `max` chars, with «…» */
export function fitLength(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, max - 1)) + "…";
}

export function lengthIssue(kind: "title" | "description", s: string | null | undefined): string | null {
  const n = (s ?? "").trim().length;
  const L = SEO_LIMITS[kind];
  if (!n) return "пусто";
  if (n < L.min) return `короткий (${n} < ${L.min})`;
  if (n > L.max) return `длинный (${n} > ${L.max})`;
  return null;
}
