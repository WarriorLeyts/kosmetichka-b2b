/** In-process cache of the published block pages (GET /api/site/home?page=); dropped on publish / banner change. */
const memo = new Map<string, { at: number; body: unknown }>();
export const HOME_TTL_MS = 60_000;
export function getHomeMemo(key = "home") {
  const m = memo.get(key);
  return m && Date.now() - m.at < HOME_TTL_MS ? m.body : null;
}
export function setHomeMemo(body: unknown, key = "home") {
  memo.set(key, { at: Date.now(), body });
}
/** a banner changed — every page may show it */
export function invalidateHome() {
  memo.clear();
}
