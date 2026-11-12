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

/**
 * Labels for catalog cards: «new» («Новинка», came for the first time) / «back» («Снова в наличии») for the
 * products of «Новые поступления» this customer can buy. Cached 5 minutes per kind of customer.
 */
type ArrivalLabel = "new" | "back";
const labelCache = new Map<string, { at: number; map: Map<number, ArrivalLabel> }>();

export async function arrivalLabels(wholesale: boolean): Promise<Map<number, ArrivalLabel>> {
  const key = wholesale ? "w" : "r";
  const hit = labelCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.map;
  let list: Arrival[] = [];
  try {
    list = await listArrivals({ wholesale, limit: 5000 });
  } catch (e) {
    console.error("[arrivals] labels:", e instanceof Error ? e.message : e); // no labels — the catalog works on
  }
  const map = new Map<number, ArrivalLabel>(list.map((a) => [a.productId, a.isNew ? "new" : "back"]));
  labelCache.set(key, { at: Date.now(), map });
  return map;
}

/** the product with its arrival label added to its labels (the admin's «Новинка» / «Хит» stay) */
export function withArrivalLabel<T extends { id: number; labels?: string[] | null }>(p: T, map: Map<number, ArrivalLabel>): T {
  const l = map.get(p.id);
  if (!l) return p;
  const labels = p.labels ?? [];
  return labels.includes(l) ? p : { ...p, labels: [...labels, l] };
}
