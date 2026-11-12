import { prisma } from "@/lib/prisma";
import { odataConfigured, odataGet } from "../scripts/onec-odata.js";

export { DISCOUNT_CARD_PREFIX, DISCOUNT_GROUP, cardGivesDiscount } from "./discountCardRule";
import { DISCOUNT_GROUP } from "./discountCardRule";

const ZERO = "00000000-0000-0000-0000-000000000000";
let groupRef: { at: number; ref: string | null } | null = null;

async function discountGroupRef(): Promise<string | null> {
  if (groupRef && Date.now() - groupRef.at < 6 * 3600_000) return groupRef.ref;
  const rows: { Ref_Key: string; Description: string; DeletionMark: boolean }[] = await odataGet("Catalog_Контрагенты", { $filter: "IsFolder eq true", $select: "Ref_Key,Description,DeletionMark" });
  const g = rows.find((r) => !r.DeletionMark && r.Description.trim().toLowerCase() === DISCOUNT_GROUP.toLowerCase());
  groupRef = { at: Date.now(), ref: g?.Ref_Key ?? null };
  return groupRef.ref;
}

/** Is the owner of this card (1С «Дисконтные карты» → «Владелец карты») in «Максма Скидка»? null — 1С didn't answer. */
export async function cardInDiscountGroup(card: string): Promise<boolean | null> {
  try {
    const group = await discountGroupRef();
    if (!group) return false;
    const cards: { ВладелецКарты_Key: string; DeletionMark: boolean }[] = await odataGet("Catalog_ДисконтныеКарты", { $filter: `КодКартыШтрихкод eq '${card.replace(/'/g, "")}'`, $select: "ВладелецКарты_Key,DeletionMark" });
    const owners = cards.filter((c) => !c.DeletionMark && c.ВладелецКарты_Key && c.ВладелецКарты_Key !== ZERO).map((c) => c.ВладелецКарты_Key);
    for (const o of owners) {
      const r: { Parent_Key: string }[] = await odataGet("Catalog_Контрагенты", { $filter: `Ref_Key eq guid'${o}'`, $select: "Parent_Key" });
      if (r[0]?.Parent_Key === group) return true;
    }
    return false;
  } catch (e) {
    console.warn("[discount-card]", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Re-checks the 1С group of a customer's card and saves it (no change when 1С doesn't answer). */
export async function refreshMaxmaDiscount(customerId: number): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { loyaltyCard: true, maxmaDiscount: true } });
  const card = c?.loyaltyCard?.replace(/\s/g, "");
  const want = card ? await cardInDiscountGroup(card) : false;
  if (want === null || !c) return Boolean(c?.maxmaDiscount);
  if (want !== c.maxmaDiscount) await prisma.customer.update({ where: { id: customerId }, data: { maxmaDiscount: want } });
  return want;
}

/** Every 6 hours: the 1С group of every linked card (a card moved into / out of «Максма Скидка»). */
export function startDiscountCards(): void {
  if (!odataConfigured()) return;
  const tick = async () => {
    const rows = await prisma.customer.findMany({ where: { OR: [{ loyaltyCard: { not: null } }, { maxmaDiscount: true }] }, select: { id: true } }).catch(() => []);
    for (const r of rows) await refreshMaxmaDiscount(r.id).catch(() => {});
  };
  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), 6 * 3600_000).unref?.();
}
