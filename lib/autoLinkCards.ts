import { prisma } from "./prisma";
import { maxmaPhone } from "./maxma";
import { DISCOUNT_CARD_PREFIX, DISCOUNT_GROUP } from "./discountCardRule";
import { odataAll, odataConfigured } from "../scripts/onec-odata.js";

type Owner = { Ref_Key: string; Parent_Key?: string; Description?: string; IsFolder?: boolean; НомерТелефонаДляПоиска?: string };
type Card = { КодКартыШтрихкод?: string; ВладелецКарты_Key?: string };
/** Normalised exact matches only; ambiguous cards are left for manual linking. */
export function matchPhoneCards(owners: Owner[], cards: Card[]) {
  const groups = new Set(owners.filter((o) => o.IsFolder && o.Description?.trim().toLowerCase() === DISCOUNT_GROUP.toLowerCase()).map((o) => o.Ref_Key));
  const byOwner = new Map(owners.filter((o) => !o.IsFolder).map((o) => [o.Ref_Key, o]));
  const found = new Map<string, { number: string; discount: boolean }[]>();
  for (const card of cards) {
    const owner = byOwner.get(card.ВладелецКарты_Key ?? "");
    const phone = maxmaPhone(owner?.НомерТелефонаДляПоиска ?? "");
    const number = card.КодКартыШтрихкод?.trim();
    if (!phone || !number) continue;
    const discount = number.startsWith(DISCOUNT_CARD_PREFIX) || groups.has(owner?.Parent_Key ?? "");
    const list = found.get(phone) ?? [];
    const same = list.find((c) => c.number === number);
    if (same) same.discount ||= discount;
    else list.push({ number, discount });
    found.set(phone, list);
  }
  const result = new Map<string, { number: string; discount: boolean }>();
  for (const [phone, list] of found) {
    const discounts = list.filter((c) => c.discount);
    const pick = discounts.length ? discounts : list;
    if (pick.length === 1) result.set(phone, pick[0]);
  }
  return result;
}
let busy = false;
/** One minute polling: a cash-desk card is linked without relying on the card already being in MAXMA. */
export async function syncPhoneCards() {
  if (busy || !odataConfigured()) return;
  busy = true;
  try {
    const [owners, cards, customers] = await Promise.all([
      odataAll("Catalog_Контрагенты", { $filter: "DeletionMark eq false", $select: "Ref_Key,Parent_Key,Description,IsFolder,НомерТелефонаДляПоиска" }),
      odataAll("Catalog_ДисконтныеКарты", { $filter: "DeletionMark eq false", $select: "КодКартыШтрихкод,ВладелецКарты_Key" }),
      prisma.customer.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true, loyaltyCard: true, maxmaDiscount: true } }),
    ]);
    const matches = matchPhoneCards(owners, cards);
    const accounts = new Map<string, number>();
    for (const c of customers) { const p = maxmaPhone(c.phone ?? ""); if (p) accounts.set(p, (accounts.get(p) ?? 0) + 1); }
    for (const c of customers) {
      const phone = maxmaPhone(c.phone ?? "");
      const card = phone ? matches.get(phone) : null;
      if (!card || accounts.get(phone!) !== 1) continue;
      // A card manually confirmed on another phone is never silently replaced or stolen.
      if (c.loyaltyCard && c.loyaltyCard !== card.number && !card.discount) continue;
      if (c.loyaltyCard === card.number && c.maxmaDiscount === card.discount) continue;
      const other = await prisma.customer.findFirst({ where: { loyaltyCard: card.number, NOT: { id: c.id } }, select: { id: true } });
      if (other) continue;
      await prisma.customer.updateMany({ where: { id: c.id, phone: c.phone, loyaltyCard: c.loyaltyCard }, data: { loyaltyCard: card.number, maxmaDiscount: card.discount } });
    }
  } catch (e) { console.warn("[auto-link-cards]", e instanceof Error ? e.message : e); }
  finally { busy = false; }
}
let started = false;
export function startPhoneCards() {
  if (started || !odataConfigured()) return;
  started = true;
  const first = setTimeout(() => void syncPhoneCards(), 5_000); first.unref?.();
  setInterval(() => void syncPhoneCards(), 60_000).unref?.();
}
