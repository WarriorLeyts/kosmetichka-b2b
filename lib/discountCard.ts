import { prisma } from "./prisma";
import { odataConfigured, odataGet } from "../scripts/onec-odata.js";
import { isGuid } from "../scripts/onec-orders.js";
import { oneCCardKinds, type OneCCardOwner, type OneCLoyaltyCard } from "./loyaltyCardGroups";
import type { CardKind } from "./discountCardRule";
export { DISCOUNT_GROUP, BONUS_GROUP, cardGivesDiscount, cardKind } from "./discountCardRule";
let folders: { at: number; rows: OneCCardOwner[] } | null = null;
/** null = 1C unavailable; unrecognized = not in either loyalty group. */
export async function cardKindIn1C(card: string): Promise<CardKind | "unrecognized" | null> {
  try {
    if (!folders || Date.now() - folders.at >= 60_000) {
      const rows: OneCCardOwner[] = await odataGet("Catalog_Контрагенты", { $filter: "IsFolder eq true and DeletionMark eq false", $select: "Ref_Key,Description,Parent_Key,IsFolder,DeletionMark" });
      folders = { at: Date.now(), rows };
    }
    const cards: OneCLoyaltyCard[] = await odataGet("Catalog_ДисконтныеКарты", { $filter: `КодКартыШтрихкод eq '${card.replace(/'/g, "''")}' and DeletionMark eq false`, $select: "КодКартыШтрихкод,ВладелецКарты_Key,DeletionMark" });
    const refs = [...new Set(cards.map(c => c.ВладелецКарты_Key).filter((ref): ref is string => Boolean(ref && isGuid(ref))))];
    if (!refs.length) return "unrecognized";
    const owners: OneCCardOwner[] = await odataGet("Catalog_Контрагенты", { $filter: refs.map(ref => `Ref_Key eq guid'${ref}'`).join(" or "), $select: "Ref_Key,Parent_Key,IsFolder,DeletionMark" });
    return oneCCardKinds([...folders.rows, ...owners], cards).get(card.trim()) ?? "unrecognized";
  } catch (e) {
    console.warn("[card-group]", e instanceof Error ? e.message : e);
    return null;
  }
}
export async function refreshMaxmaDiscount(customerId: number): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { loyaltyCard: true, maxmaDiscount: true, maxmaRetail: true } });
  if (!c) return false;
  const kind = c.loyaltyCard ? await cardKindIn1C(c.loyaltyCard) : "unrecognized";
  if (kind === null) return c.maxmaDiscount;
  const flags = { maxmaDiscount: kind === "discount", maxmaRetail: kind === "bonus" };
  if (c.maxmaDiscount !== flags.maxmaDiscount || c.maxmaRetail !== flags.maxmaRetail) await prisma.customer.updateMany({ where: { id: customerId, loyaltyCard: c.loyaltyCard }, data: flags });
  return flags.maxmaDiscount;
}
/** Batch phone sync refreshes every linked card's kind each minute; this is an additional periodic check. */
export function startDiscountCards(): void {
  if (!odataConfigured()) return;
  const tick = async () => {
    const rows = await prisma.customer.findMany({ where: { OR: [{ loyaltyCard: { not: null } }, { maxmaDiscount: true }, { maxmaRetail: true }] }, select: { id: true } }).catch(() => []);
    for (const r of rows) await refreshMaxmaDiscount(r.id).catch(() => {});
  };
  setInterval(() => void tick(), 6 * 3600_000).unref?.();
}
