export const DEMAND_NOTICE = "Учтём ваши пожелания и сообщим, когда товар поступит. Это не бронь: товар не резервируется. Наличие и цену нужно проверить при оформлении заказа.";
export const RESTOCK_WINDOW_MS = 24 * 60 * 60 * 1000;
export function demandQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10000 ? value : null;
}
export function demandId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function demandName(value: unknown): { name: string; key: string } | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 160) return null;
  return { name, key: name.toLocaleLowerCase("ru-RU") };
}
/** Native calls have no Origin. Browsers must write from this site's origin. */
export function demandSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (request.headers.get("host") || new URL(request.url).host); } catch { return false; }
}
