import type { Prisma } from "@prisma/client";

/**
 * Catalogue search by words: «shik тон» finds every product that has BOTH «shik» and «тон»
 * somewhere — in the name, the brand, the article or the barcode — in any order and as parts of
 * words («тон» → «тональный», «тонер»). Each word also matches when it was typed in the wrong
 * keyboard layout («ырш» → «shi», «nfy» → «тан»).
 */

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
const toRu = new Map([...EN].map((c, i) => [c, RU[i]]));
const toEn = new Map([...RU].map((c, i) => [c, EN[i]]));

/** the word typed in the other keyboard layout, or null when it doesn't change */
export function otherLayout(word: string): string | null {
  const w = word.toLowerCase();
  const latin = /[a-z]/.test(w) && !/[а-яё]/.test(w);
  const cyr = /[а-яё]/.test(w) && !/[a-z]/.test(w);
  if (!latin && !cyr) return null;
  const map = latin ? toRu : toEn;
  const out = [...w].map((c) => map.get(c) ?? c).join("");
  // only letters make sense as a layout mix-up (digits/sizes stay as they are)
  return out !== w && /^[\p{L}]+$/u.test(out) ? out : null;
}

export function searchWords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[«»"'(),]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function wordMatch(w: string): Prisma.ProductWhereInput[] {
  const m: Prisma.ProductWhereInput[] = [
    { name: { contains: w, mode: "insensitive" } },
    { brand: { name: { contains: w, mode: "insensitive" } } },
    { article: { contains: w, mode: "insensitive" } },
    { barcode: { contains: w } },
  ];
  const alt = w.length >= 2 ? otherLayout(w) : null;
  if (alt) {
    m.push({ name: { contains: alt, mode: "insensitive" } }, { brand: { name: { contains: alt, mode: "insensitive" } } });
  }
  return m;
}

/** Prisma condition for the query (empty object for an empty query). */
export function productSearchWhere(q: string | null | undefined): Prisma.ProductWhereInput {
  const words = searchWords(q ?? "");
  if (words.length === 0) return {};
  return { AND: words.map((w) => ({ OR: wordMatch(w) })) };
}
