/** In-process cache of the published home blocks (GET /api/site/home); dropped on publish / banner change. */
let memo: { at: number; body: unknown } | null = null;
export const HOME_TTL_MS = 60_000;
export function getHomeMemo() {
  return memo && Date.now() - memo.at < HOME_TTL_MS ? memo.body : null;
}
export function setHomeMemo(body: unknown) {
  memo = { at: Date.now(), body };
}
export function invalidateHome() {
  memo = null;
}
