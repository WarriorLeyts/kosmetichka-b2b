import { prisma } from "./prisma";
import { findCard, maxmaConfigured, maxmaPhone } from "./maxma";
import { cardKindIn1C, refreshMaxmaDiscount } from "./discountCard";

type CustomerCard = {
  id: number;
  phone: string | null;
  phoneUnverified?: boolean;
  loyaltyCard: string | null;
  loyaltyAutoLinkDisabled?: boolean;
  loyaltyUnlinkedCards?: string[];
  maxmaRetail?: boolean;
  maxmaDiscount: boolean;
  priceType: string;
  isActive: boolean;
  isApproved: boolean;
};
const select = { id: true, phone: true, phoneUnverified: true, loyaltyCard: true, loyaltyAutoLinkDisabled: true, loyaltyUnlinkedCards: true, maxmaRetail: true, maxmaDiscount: true, priceType: true, isActive: true, isApproved: true } as const;
const eligible = (c: CustomerCard) => !c.loyaltyAutoLinkDisabled && !c.phoneUnverified && c.isActive && c.isApproved && ["retail", "discount"].includes(c.priceType);

async function syncCustomer(c: CustomerCard, accounts: CustomerCard[]) {
  if (!eligible(c)) return;
  const refreshExisting = async () => {
    if (c.loyaltyCard) await refreshMaxmaDiscount(c.id);
  };
  const phone = maxmaPhone(c.phone ?? "");
  if (!maxmaConfigured() || !phone || accounts.filter((a) => maxmaPhone(a.phone ?? "") === phone).length !== 1) {
    await refreshExisting();
    return;
  }
  const card = await findCard({ phoneNumber: phone });
  // MAXMA owns the current card number; exact phone matching is required for automatic linking.
  if (!card || maxmaPhone(card.phone ?? "") !== phone || c.loyaltyCard === card.number) {
    await refreshExisting();
    return;
  }
  if (c.loyaltyUnlinkedCards?.includes(card.number)) { await refreshExisting(); return; }
  const kind = await cardKindIn1C(card.number);
  if (kind === "unrecognized") { await refreshExisting(); return; }
  let discount = kind === "discount";
  if (c.loyaltyCard) {
    // A manual card confirmed on another phone must never be silently replaced.
    const oldCard = await findCard({ card: c.loyaltyCard });
    if (oldCard && maxmaPhone(oldCard.phone ?? "") !== phone) return;
    // The cashier changes the card number on conversion to discount. Wait for 1C confirmation;
    // a bonus card or an unavailable 1C must not replace an existing card (discount has priority).
    if (kind !== "discount") {
      await refreshExisting();
      return;
    }
    discount = true;
  }
  const other = await prisma.customer.findFirst({ where: { loyaltyCard: card.number, NOT: { id: c.id } }, select: { id: true } });
  if (other) return;
  try {
    const result = await prisma.customer.updateMany({
      where: { id: c.id, phone: c.phone, phoneUnverified: false, loyaltyAutoLinkDisabled: false, loyaltyCard: c.loyaltyCard, maxmaDiscount: c.maxmaDiscount, priceType: c.priceType, isActive: true, isApproved: true, NOT: { loyaltyUnlinkedCards: { has: card.number } } },
      data: { loyaltyCard: card.number, maxmaDiscount: discount, maxmaRetail: kind === "bonus" },
    });
    // Save the card before checking 1C: a 1C outage must not prevent a MAXMA card being linked.
    if (result.count && !discount) await refreshMaxmaDiscount(c.id);
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    // Another account claimed the card concurrently; the unique constraint decides ownership.
  }
}

/** Starts immediately after successful SMS-verified retail registration; failures retry in the worker. */
export async function syncCustomerCard(customerId: number) {
  try {
    const accounts = await prisma.customer.findMany({ where: { phone: { not: null } }, select });
    const c = accounts.find((a) => a.id === customerId);
    if (c) await syncCustomer(c, accounts);
  } catch {
    console.warn("[auto-link-cards] Customer card sync failed; will retry");
  }
}

let busy = false;
/** Retry MAXMA discovery, follow confirmed discount-card replacements and refresh 1C groups once a minute. */
export async function syncPhoneCards() {
  if (busy) return;
  busy = true;
  try {
    const accounts = await prisma.customer.findMany({ where: { phone: { not: null } }, select });
    for (const c of accounts) {
      try { await syncCustomer(c, accounts); }
      catch { console.warn("[auto-link-cards] Customer card sync failed; will retry"); }
    }
  } catch { console.warn("[auto-link-cards] Card sync failed; will retry"); }
  finally { busy = false; }
}
let started = false;
export function startPhoneCards() {
  if (started) return;
  started = true;
  const first = setTimeout(() => void syncPhoneCards(), 5_000); first.unref?.();
  setInterval(() => void syncPhoneCards(), 60_000).unref?.();
}
