import { prisma } from "@/lib/prisma";

/**
 * «Новые поступления» (ProductArrival, scripts/import-arrivals.js): what came in the last 10 days, newest
 * first, one entry per product. Each customer sees what he can buy: retail — what came to the shop
 * («1. Мега Косметичка», transfers), wholesale — to the warehouse (receipts) and to the shop. Only products
 * in stock for him, not hidden, with a photo. «Новинка» — the product's first receipt ever is in the period;
 * those go first.
 */
export const ARRIVAL_DAYS = 10;

export type Arrival = { productId: number; arrivedAt: Date; isNew: boolean; places: string[] };

export async function listArrivals({ wholesale, limit = 40, staff = false }: { wholesale: boolean; limit?: number; staff?: boolean }): Promise<Arrival[]> {
  const since = new Date(Date.now() - ARRIVAL_DAYS * 86400_000);
  const places = staff || wholesale ? ["stock", "shop"] : ["shop"];
  const rows = await prisma.productArrival
    .findMany({
      where: { docDate: { gte: since }, place: { in: places } },
      select: { docDate: true, place: true, firstReceiptAt: true, product: { select: { id: true, hidden: true, stock: true, wholesaleStock: true, images: { take: 1, select: { id: true } } } } },
      orderBy: { docDate: "desc" },
    })
    .catch((e: unknown) => {
      console.error("[arrivals]", e instanceof Error ? e.message : e);
      return [];
    });
  const out = new Map<number, Arrival>();
  for (const r of rows) {
    const p = r.product;
    if (p.hidden || !p.images.length) continue;
    // in stock for this customer: retail — the shop (Product.stock), wholesale — what he may order
    const avail = staff ? (p.stock ?? 0) > 0 || p.wholesaleStock > 0 : wholesale ? p.wholesaleStock > 0 : (p.stock ?? 0) > 0;
    if (!avail) continue;
    const isNew = Boolean(r.firstReceiptAt && r.firstReceiptAt >= since);
    const cur = out.get(p.id);
    if (cur) {
      if (!cur.places.includes(r.place)) cur.places.push(r.place);
      cur.isNew = cur.isNew || isNew;
      continue;
    }
    out.set(p.id, { productId: p.id, arrivedAt: r.docDate, isNew, places: [r.place] });
  }
  // «Новинки» first (they would drown among restocks), then the rest — each group newest first
  const all = [...out.values()];
  return [...all.filter((a) => a.isNew), ...all.filter((a) => !a.isNew)].slice(0, limit);
}
