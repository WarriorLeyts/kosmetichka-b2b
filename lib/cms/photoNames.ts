/**
 * «ГБ-00000370», «ГБ000000370», «гб 370» → «ГБ370»: the article without separators and leading zeros,
 * so a file named after the article finds the product however the zeros / hyphen were written.
 */
export function articleKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/Ё/g, "Е").replace(/[\s_\-.]/g, "");
  const m = s.match(/^([A-ZА-Я]*)0*(\d+)$/);
  if (m) return m[1] + m[2];
  return s || null;
}

/**
 * File name → { key, index }: «ГБ-00000370.jpg» → main photo, «ГБ-00000370_2.jpg», «ГБ-00000370 (2).jpg»,
 * «ГБ-00000370-2.jpg» (only when the base is already a full article) → photo number 2.
 */
export function parsePhotoName(fileName: string): { base: string; index: number } | null {
  const name = fileName.split("/").pop()!.replace(/\.(jpe?g|png|webp)$/i, "");
  if (!name || name.startsWith(".")) return null;
  let m = name.match(/^(.+?)\s*[_ ]\(?(\d{1,2})\)?$/) || name.match(/^(.+?)\s*\((\d{1,2})\)$/);
  if (m) return { base: m[1], index: Number(m[2]) };
  // «НФ-00000907-2»: a short number after the last hyphen of an article that already has its own hyphen
  m = name.match(/^([A-Za-zА-Яа-яЁё]+-\d{5,})-(\d{1,2})$/);
  if (m) return { base: m[1], index: Number(m[2]) };
  return { base: name, index: 1 };
}
