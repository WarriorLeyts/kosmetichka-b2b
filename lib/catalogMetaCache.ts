/** In-process copy of GET /api/mobile/catalog-meta (5 minutes); dropped when the catalog settings are saved. */
let memo: { at: number; body: unknown } | null = null;
export const getCatalogMetaMemo = () => (memo && Date.now() - memo.at < 300_000 ? memo.body : null);
export const setCatalogMetaMemo = (body: unknown) => {
  memo = { at: Date.now(), body };
};
export const invalidateCatalogMeta = () => {
  memo = null;
};
