import { prisma } from "@/lib/prisma";

/**
 * Who changed which order line. Every edit of an order's lines — by staff (admin site, Team app,
 * Bitrix24) or by the customer (app / site) — is logged as OrderItemChange rows:
 *   added   — a new line;
 *   removed — a line taken out (kept in the log, so it stays visible);
 *   changed — quantity, price or variant of a line changed.
 * The customer sees the manager's changes on the order, staff see the customer's.
 */

export type ChangeSide = "staff" | "customer";
export type ChangeKind = "added" | "removed" | "changed";

/** The parts of an order line the log compares. */
export type LineSnapshot = {
  id: number;
  productId: number;
  productName: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  variantName?: string | null;
  variantImageUrl?: string | null;
};

export type ChangeRow = {
  orderItemId: number | null;
  productId: number | null;
  productName: string;
  barcode: string | null;
  kind: ChangeKind;
  oldQuantity: number | null;
  newQuantity: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  oldVariant: string | null;
  newVariant: string | null;
  imageUrl: string | null;
};

/** What changed between the lines before and after an edit (lines matched by id). */
export function diffLines(before: LineSnapshot[], after: LineSnapshot[]): ChangeRow[] {
  const prev = new Map(before.map((l) => [l.id, l]));
  const next = new Map(after.map((l) => [l.id, l]));
  const rows: ChangeRow[] = [];
  const base = (l: LineSnapshot) => ({
    orderItemId: l.id,
    productId: l.productId,
    productName: l.productName,
    barcode: l.barcode ?? null,
    imageUrl: l.variantImageUrl ?? null,
  });
  for (const b of before) {
    const a = next.get(b.id);
    if (!a) {
      rows.push({ ...base(b), kind: "removed", oldQuantity: b.quantity, newQuantity: null, oldPrice: b.price, newPrice: null, oldVariant: b.variantName ?? null, newVariant: null });
      continue;
    }
    const qty = a.quantity !== b.quantity;
    const price = a.price !== b.price;
    const variant = (a.variantName ?? null) !== (b.variantName ?? null);
    if (qty || price || variant) {
      rows.push({
        ...base(a),
        kind: "changed",
        oldQuantity: qty ? b.quantity : null,
        newQuantity: qty ? a.quantity : null,
        oldPrice: price ? b.price : null,
        newPrice: price ? a.price : null,
        oldVariant: variant ? b.variantName ?? null : null,
        newVariant: variant ? a.variantName ?? null : null,
      });
    }
  }
  for (const a of after) {
    if (prev.has(a.id)) continue;
    rows.push({ ...base(a), kind: "added", oldQuantity: null, newQuantity: a.quantity, oldPrice: null, newPrice: a.price, oldVariant: null, newVariant: a.variantName ?? null });
  }
  return rows;
}

/** Logs the difference between two states of an order's lines. Never throws (logging must not break an edit). */
export async function logOrderChanges(
  orderId: number,
  side: ChangeSide,
  actorName: string | null,
  before: LineSnapshot[],
  after: LineSnapshot[]
): Promise<ChangeRow[]> {
  const rows = diffLines(before, after);
  if (rows.length === 0) return rows;
  try {
    await prisma.orderItemChange.createMany({
      data: rows.map((r) => ({ ...r, orderId, side, actorName: actorName?.slice(0, 120) ?? null })),
    });
  } catch (e) {
    console.error(`[order-changes] order ${orderId}:`, e instanceof Error ? e.message : e);
  }
  return rows;
}

// ── reading ────────────────────────────────────────────────────────────────────

/** Shown on a line that is still in the order: what one side (staff / customer) did to it. */
export type LineChange = {
  kind: "added" | "changed";
  actorName: string | null;
  /** values before this side's changes (null = that part didn't change) */
  oldQuantity: number | null;
  oldPrice: number | null;
  oldVariant: string | null;
  at: string;
};

/** Per line, separately for each side: the customer is shown `staff`, staff are shown `customer`. */
export type LineChanges = { staff?: LineChange; customer?: LineChange };

/** A line that was in the order and was taken out. */
export type RemovedLine = {
  orderItemId: number | null;
  productId: number | null;
  productName: string;
  barcode: string | null;
  variantName: string | null;
  quantity: number | null;
  price: number | null;
  imageUrl: string | null;
  side: ChangeSide;
  actorName: string | null;
  at: string;
};

type StoredChange = {
  orderItemId: number | null;
  productId: number | null;
  productName: string;
  barcode: string | null;
  kind: string;
  side: string;
  actorName: string | null;
  oldQuantity: number | null;
  newQuantity: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  oldVariant: string | null;
  newVariant: string | null;
  imageUrl: string | null;
  createdAt: Date;
};

type CurrentLine = { id: number; quantity: number; price: number; variantName?: string | null };

/**
 * Turns the log into what is shown: for every current line what staff and what the customer did
 * to it (added it / changed it and what it was before), and the removed lines.
 * `currentLines` are the order's lines now (to tell removed from present and drop no-op changes).
 */
export function describeChanges(
  changes: StoredChange[],
  currentLines: CurrentLine[]
): { lines: Record<number, LineChanges>; removed: RemovedLine[] } {
  const sorted = [...changes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const current = new Map(currentLines.map((l) => [l.id, l]));
  const lines: Record<number, LineChanges> = {};
  const removed: RemovedLine[] = [];

  for (const c of sorted) {
    const side: ChangeSide = c.side === "customer" ? "customer" : "staff";
    const at = c.createdAt.toISOString();
    if (c.kind === "removed") {
      if (c.orderItemId != null && current.has(c.orderItemId)) continue;
      removed.push({
        orderItemId: c.orderItemId,
        productId: c.productId,
        productName: c.productName,
        barcode: c.barcode,
        variantName: c.oldVariant,
        quantity: c.oldQuantity,
        price: c.oldPrice,
        imageUrl: c.imageUrl,
        side,
        actorName: c.actorName,
        at,
      });
      continue;
    }
    if (c.orderItemId == null || !current.has(c.orderItemId)) continue;
    const entry = (lines[c.orderItemId] ??= {});
    const was = entry[side];
    if (c.kind === "added") {
      entry[side] = { kind: "added", actorName: c.actorName, oldQuantity: null, oldPrice: null, oldVariant: null, at };
    } else if (was?.kind === "added") {
      entry[side] = { ...was, actorName: c.actorName ?? was.actorName, at }; // an added line stays «added»
    } else {
      // a series of changes keeps the oldest «было» of each part
      entry[side] = {
        kind: "changed",
        actorName: c.actorName,
        oldQuantity: was?.oldQuantity ?? c.oldQuantity,
        oldPrice: was?.oldPrice ?? c.oldPrice,
        oldVariant: was?.oldVariant ?? c.oldVariant,
        at,
      };
    }
  }

  // a change that ended where it started (2 → 3 → 2) is no change
  for (const [key, entry] of Object.entries(lines)) {
    const l = current.get(Number(key))!;
    for (const side of ["staff", "customer"] as const) {
      const ch = entry[side];
      if (!ch || ch.kind !== "changed") continue;
      const q = ch.oldQuantity != null && ch.oldQuantity !== l.quantity ? ch.oldQuantity : null;
      const p = ch.oldPrice != null && ch.oldPrice !== l.price ? ch.oldPrice : null;
      const v = ch.oldVariant != null && ch.oldVariant !== (l.variantName ?? null) ? ch.oldVariant : null;
      if (q == null && p == null && v == null) delete entry[side];
      else entry[side] = { ...ch, oldQuantity: q, oldPrice: p, oldVariant: v };
    }
    if (!entry.staff && !entry.customer) delete lines[Number(key)];
  }
  return { lines, removed };
}

/** Loads and describes the changes of one order (with photos for removed lines). */
export async function orderChanges(orderId: number, currentLines: CurrentLine[]) {
  // the history is extra information: if it can't be read the order still opens
  const rows = await prisma.orderItemChange.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } }).catch((e) => {
    console.error(`[order-changes] read ${orderId}:`, e instanceof Error ? e.message : e);
    return [];
  });
  const out = describeChanges(rows, currentLines);
  const need = [...new Set(out.removed.filter((r) => !r.imageUrl && r.productId).map((r) => r.productId as number))];
  if (need.length) {
    const imgs = await prisma.productImage.findMany({ where: { productId: { in: need } }, select: { productId: true, path: true }, orderBy: { id: "asc" } });
    const first = new Map<number, string>();
    for (const i of imgs) if (!first.has(i.productId)) first.set(i.productId, i.path);
    for (const r of out.removed) if (!r.imageUrl && r.productId) r.imageUrl = first.get(r.productId) ?? null;
  }
  return out;
}

const qtyWord = (n: number) => `${n} шт.`;
const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

/** One-line summary of an edit for the order chat / notifications: «+ Тонер 2 шт.; − Маска; Пенка: 1 → 3 шт.» */
export function summarizeRows(rows: ChangeRow[], limit = 8): string {
  const parts = rows.slice(0, limit).map((r) => {
    const name = r.productName + (r.newVariant || r.oldVariant ? ` (${r.newVariant ?? r.oldVariant})` : "");
    if (r.kind === "added") return `+ ${name} — ${qtyWord(r.newQuantity ?? 0)}`;
    if (r.kind === "removed") return `− ${name}`;
    const bits: string[] = [];
    if (r.oldQuantity != null) bits.push(`${r.oldQuantity} → ${qtyWord(r.newQuantity ?? 0)}`);
    if (r.oldPrice != null) bits.push(`${rub(r.oldPrice)} → ${rub(r.newPrice ?? 0)}`);
    if (r.oldVariant != null || r.newVariant != null) bits.push(`вариант ${r.oldVariant ?? "—"} → ${r.newVariant ?? "—"}`);
    return `${r.productName}: ${bits.join(", ")}`;
  });
  if (rows.length > limit) parts.push(`и ещё ${rows.length - limit}`);
  return parts.join("\n");
}

// ── chat card ──────────────────────────────────────────────────────────────────

/** One line of the «order changed» chat card. */
export type ChangeCardLine = { name: string; imagePath: string | null; kind: ChangeKind; text: string };

/** «3 → 4 шт.», «150 ₽ → 120 ₽», «добавлено, 2 шт.», «удалено» */
export function changeLineText(r: ChangeRow): string {
  if (r.kind === "added") return `добавлено · ${qtyWord(r.newQuantity ?? 0)}`;
  if (r.kind === "removed") return "удалено";
  const bits: string[] = [];
  if (r.oldQuantity != null) bits.push(`${r.oldQuantity} → ${qtyWord(r.newQuantity ?? 0)}`);
  if (r.oldPrice != null) bits.push(`${rub(r.oldPrice)} → ${rub(r.newPrice ?? 0)}`);
  if (r.oldVariant != null || r.newVariant != null) bits.push(`вариант: ${r.oldVariant ?? "—"} → ${r.newVariant ?? "—"}`);
  return bits.join(", ");
}

/**
 * The order chat message about an edit: a JSON card {"_t":"order-change"} with a photo, the name and
 * what changed for every line — the customer and the manager see at once which products it is about.
 * Apps that don't know the card show `text` (a plain summary).
 */
export async function changeChatMessage(side: ChangeSide, actorName: string | null, rows: ChangeRow[]): Promise<string> {
  const need = [...new Set(rows.filter((r) => !r.imageUrl && r.productId).map((r) => r.productId as number))];
  const first = new Map<number, string>();
  if (need.length) {
    const imgs = await prisma.productImage
      .findMany({ where: { productId: { in: need } }, select: { productId: true, path: true }, orderBy: { id: "asc" } })
      .catch(() => []);
    for (const i of imgs) if (!first.has(i.productId)) first.set(i.productId, i.path);
  }
  const lines: ChangeCardLine[] = rows.slice(0, 30).map((r) => ({
    name: r.productName + (r.newVariant || r.oldVariant ? ` (${r.newVariant ?? r.oldVariant})` : ""),
    imagePath: r.imageUrl ?? (r.productId ? first.get(r.productId) ?? null : null),
    kind: r.kind,
    text: changeLineText(r),
  }));
  const title = side === "customer" ? "Клиент изменил заказ" : `${actorName && actorName !== "Менеджер" ? `Менеджер (${actorName})` : "Менеджер"} изменил заказ`;
  return JSON.stringify({ _t: "order-change", by: side, title, lines, text: `${title}:\n${summarizeRows(rows, 12)}` });
}
