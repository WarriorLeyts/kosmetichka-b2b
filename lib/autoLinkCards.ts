import { prisma } from "./prisma";
import { maxmaPhone } from "./maxma";
import { oneCCardKinds, type OneCCardOwner, type OneCLoyaltyCard } from "./loyaltyCardGroups";
import { odataAll, odataConfigured } from "../scripts/onec-odata.js";

type Owner = OneCCardOwner;
type Card = OneCLoyaltyCard;
/** Normalised exact matches only; ambiguous cards are left for manual linking. */
export function matchPhoneCards(owners: Owner[], cards: Card[]) {
  const kinds = oneCCardKinds(owners, cards);
  const byOwner = new Map(owners.filter((o) => !o.IsFolder).map((o) => [o.Ref_Key, o]));
  const found = new Map<string, { number: string; discount: boolean }[]>();
  const phonesByCard = new Map<string, Set<string>>();
  for (const card of cards) {
    const owner = byOwner.get(card.ВладелецКарты_Key ?? "");
    const phone = maxmaPhone(owner?.НомерТелефонаДляПоиска ?? "");
    const number = card.КодКартыШтрихкод?.trim();
    if (!phone || !number || !kinds.has(number)) continue;
    const phones = phonesByCard.get(number) ?? new Set<string>();
    phones.add(phone); phonesByCard.set(number, phones);
    const discount = kinds.get(number) === "discount";
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
    if (pick.length === 1 && phonesByCard.get(pick[0].number)?.size === 1) result.set(phone, pick[0]);
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
      prisma.customer.findMany({ where: { OR: [{ phone: { not: null } }, { loyaltyCard: { not: null } }] }, select: { id: true, phone: true, loyaltyCard: true, maxmaDiscount: true, maxmaRetail: true, loyaltyUnlinkedCards: true } }),
    ]);
    const matches = matchPhoneCards(owners, cards);
    const kinds = oneCCardKinds(owners, cards);
    const accounts = new Map<string, number>();
    for (const c of customers) { const p = maxmaPhone(c.phone ?? ""); if (p) accounts.set(p, (accounts.get(p) ?? 0) + 1); }
    for (const c of customers) {
      const kind = c.loyaltyCard ? kinds.get(c.loyaltyCard) : null;
      const flags = { maxmaDiscount: kind === "discount", maxmaRetail: kind === "bonus" };
      if (c.loyaltyCard && (c.maxmaDiscount !== flags.maxmaDiscount || c.maxmaRetail !== flags.maxmaRetail)) {
        await prisma.customer.updateMany({ where: { id: c.id, loyaltyCard: c.loyaltyCard }, data: flags });
      }
      const phone = maxmaPhone(c.phone ?? "");
      const card = phone ? matches.get(phone) : null;
      if (!card || accounts.get(phone!) !== 1 || c.loyaltyUnlinkedCards?.includes(card.number)) continue;
      // A manually linked card is kept; a newly issued discount card on this phone may upgrade it.
      if (c.loyaltyCard && c.loyaltyCard !== card.number && !card.discount) continue;
      if (c.loyaltyCard === card.number) continue;
      const other = await prisma.customer.findFirst({ where: { loyaltyCard: card.number, NOT: { id: c.id } }, select: { id: true } });
      if (other) continue;
      try {
        await prisma.customer.updateMany({ where: { id: c.id, phone: c.phone, loyaltyCard: c.loyaltyCard, NOT: { loyaltyUnlinkedCards: { has: card.number } } }, data: { loyaltyCard: card.number, maxmaDiscount: card.discount, maxmaRetail: !card.discount } });
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        // Another account linked this card after our check. The database decides ownership atomically.
      }
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
