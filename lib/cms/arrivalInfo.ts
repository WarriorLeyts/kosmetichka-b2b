import { prisma } from "@/lib/prisma";
import { arrivalKindOf, arrivalWindows, getArrivalSettings } from "@/lib/arrivalSettings";

/**
 * «Новинка» / «Снова в наличии» as the admin panel shows them: the same rule as the site (lib/arrivals.ts —
 * a receipt / transfer from 1С within the periods of Настройки → Поступления), but for every product, also those the site doesn't show yet (no photo, hidden, sold out) —
 * the panel says why.
 */
export type ArrivalKind = "new" | "back";

/** productId → kind, for the products that came in the period (a cheap query: ProductArrival is small) */
export async function arrivalKinds(): Promise<Map<number, ArrivalKind>> {
  const w = arrivalWindows(await getArrivalSettings());
  const rows = await prisma.productArrival
    .findMany({ where: { docDate: { gte: w.since } }, select: { docDate: true, firstReceiptAt: true, product: { select: { id: true } } } })
    .catch(() => []);
  const out = new Map<number, ArrivalKind>();
  for (const r of rows) {
    const kind = arrivalKindOf(r, w);
    if (kind && (kind === "new" || !out.has(r.product.id))) out.set(r.product.id, kind);
  }
  return out;
}

/** ids of the products of one kind — for the «Метки» filter of the products table */
export async function arrivalIds(kind: ArrivalKind): Promise<number[]> {
  return [...(await arrivalKinds())].filter(([, k]) => k === kind).map(([id]) => id);
}

export const PLACE_LABELS: Record<string, string> = { stock: "Склад (поступление)", shop: "Магазин (перемещение)" };

/**
 * The product's arrivals and whether the site shows the label now: without a photo, hidden or with nothing
 * to buy, «Новые поступления» skip it (lib/arrivals.ts listArrivals).
 */
export async function productArrivalInfo(p: { guid: string; hidden: boolean; stock: number | null; wholesaleStock: number; photos: number }) {
  const s = await getArrivalSettings();
  const w = arrivalWindows(s);
  const rows = await prisma.productArrival
    .findMany({ where: { productGuid: p.guid }, orderBy: { docDate: "desc" }, take: 15, select: { place: true, docNumber: true, docDate: true, qty: true, firstReceiptAt: true } })
    .catch(() => []);
  const kinds = rows.map((r) => arrivalKindOf(r, w));
  const recent = rows.filter((_, i) => kinds[i]);
  const firstReceiptAt = rows.find((r) => r.firstReceiptAt)?.firstReceiptAt ?? null;
  const kind: ArrivalKind | null = kinds.includes("new") ? "new" : kinds.includes("back") ? "back" : null;
  const why: string[] = [];
  if (kind) {
    if (p.hidden) why.push("товар скрыт");
    if (!p.photos) why.push("нет фото");
    if ((p.stock ?? 0) <= 0 && p.wholesaleStock <= 0) why.push("нет в наличии");
  }
  return {
    kind,
    shownOnSite: Boolean(kind) && !why.length,
    why,
    firstReceiptAt,
    /** «Новинка» until (the first receipt + the period), the label at all until (the last arrival + the period) */
    newUntil: kind === "new" && firstReceiptAt ? new Date(firstReceiptAt.getTime() + s.newDays * 86400_000) : null,
    until: recent.length ? new Date(recent[0].docDate.getTime() + s.backDays * 86400_000) : null,
    newDays: s.newDays,
    backDays: s.backDays,
    rows,
  };
}
