import { BONUS_GROUP, DISCOUNT_GROUP, type CardKind } from "./discountCardRule";
export type OneCCardOwner = { Ref_Key: string; Parent_Key?: string; Description?: string; IsFolder?: boolean; DeletionMark?: boolean; НомерТелефонаДляПоиска?: string };
export type OneCLoyaltyCard = { КодКартыШтрихкод?: string; ВладелецКарты_Key?: string; DeletionMark?: boolean };
/** Resolve a folder and its ancestors, independent of barcode prefixes. */
export function ownerCardKind(owner: OneCCardOwner, owners: OneCCardOwner[]): CardKind | null {
  return kindFromIndex(owner, new Map(owners.filter(o => !o.DeletionMark).map(o => [o.Ref_Key, o])));
}
function kindFromIndex(owner: OneCCardOwner, byId: Map<string, OneCCardOwner>): CardKind | null {
  const seen = new Set<string>();
  let ref = owner.Parent_Key;
  while (ref && !seen.has(ref)) {
    seen.add(ref); const folder = byId.get(ref);
    if (!folder?.IsFolder) break;
    const name = folder.Description?.trim().toLowerCase();
    if (name === DISCOUNT_GROUP.toLowerCase()) return "discount";
    if (name === BONUS_GROUP.toLowerCase()) return "bonus";
    ref = folder.Parent_Key;
  }
  return null;
}
export function oneCCardKinds(owners: OneCCardOwner[], cards: OneCLoyaltyCard[]): Map<string, CardKind> {
  const byId = new Map(owners.filter(o => !o.DeletionMark && !o.IsFolder).map(o => [o.Ref_Key, o]));
  const folders = new Map(owners.filter(o => !o.DeletionMark).map(o => [o.Ref_Key, o]));
  const found = new Map<string, Set<CardKind | "unrecognized">>();
  for (const card of cards) {
    if (card.DeletionMark) continue;
    const number = card.КодКартыШтрихкод?.trim(); if (!number) continue;
    const owner = byId.get(card.ВладелецКарты_Key ?? "");
    const kinds = found.get(number) ?? new Set();
    kinds.add(owner ? kindFromIndex(owner, folders) ?? "unrecognized" : "unrecognized");
    found.set(number, kinds);
  }
  const result = new Map<string, CardKind>();
  for (const [number, kinds] of found) if (kinds.size === 1) {
    const kind = [...kinds][0]; if (kind !== "unrecognized") result.set(number, kind);
  }
  return result;
}
