import { prisma } from "./prisma";
import { findCard, maxmaConfigured, maxmaPhone } from "./maxma";
import { refreshMaxmaDiscount } from "./discountCard";

type CustomerCard = {
  id: number;
  phone: string | null;
  loyaltyCard: string | null;
  maxmaDiscount: boolean;
  priceType: string;
  isActive: boolean;
  isApproved: boolean;
};
const select = { id: true, phone: true, loyaltyCard: true, maxmaDiscount: true, priceType: true, isActive: true, isApproved: true } as const;
const eligible = (c: CustomerCard) => c.isActive && c.isApproved && ["retail", "discount"].includes(c.priceType);

async function syncCustomer(c: CustomerCard, accounts: CustomerCard[]) {
  if (!eligible(c)) return;
  // An existing card keeps its number (including manually confirmed cards).
  // Moving its owner into/out of the 1C group only changes its pricing status.
  if (c.loyaltyCard) {
    await refreshMaxmaDiscount(c.id);
    return;
  }
  if (!maxmaConfigured()) return;
  const phone = maxmaPhone(c.phone ?? "");
  if (!phone || accounts.filter((a) => maxmaPhone(a.phone ?? "") === phone).length !== 1) return;
  const card = await findCard({ phoneNumber: phone });
  // MAXMA is the source of the card; a missing/mismatched owner phone is not proof of ownership.
  if (!card || maxmaPhone(card.phone ?? "") !== phone) return;
  const other = await prisma.customer.findFirst({ where: { loyaltyCard: card.number, NOT: { id: c.id } }, select: { id: true } });
  if (other) return;
  try {
    const result = await prisma.customer.updateMany({
      where: { id: c.id, phone: c.phone, loyaltyCard: null, priceType: c.priceType, isActive: true, isApproved: true },
      data: { loyaltyCard: card.number, maxmaDiscount: false },
    });
    // Save the card before checking 1C: a 1C outage must not prevent a MAXMA card being linked.
    if (result.count) await refreshMaxmaDiscount(c.id);
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
/** Retry missing MAXMA cards and refresh the group of linked retail cards once a minute. */
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
