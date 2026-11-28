/** Cache staff/public metadata separately: private inventory must never populate customer filters. */
const memo = new Map<string, { at: number; body: unknown }>();
export const getCatalogMetaMemo = (key = "public") => {
  const hit = memo.get(key);
  return hit && Date.now() - hit.at < 300_000 ? hit.body : null;
};
export const setCatalogMetaMemo = (body: unknown, key = "public") => { memo.set(key, { at: Date.now(), body }); };
export const invalidateCatalogMeta = () => { memo.clear(); };
