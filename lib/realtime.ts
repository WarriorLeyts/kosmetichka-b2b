import { EventEmitter } from "events";

/**
 * Live updates: the site tells open screens (customer app / website, Team / admin) the moment an order,
 * its items, chat or the customer's notifications change, so they reload at once instead of waiting
 * for the next poll. One Node process (pm2 fork mode) → an in-memory bus is enough.
 *
 * Events are only «something changed» hints ({t, id}); the screens load the data themselves with their
 * normal, access-checked requests — nothing private travels through here.
 */
export type LiveEvent =
  /** an order (status, items, chat, changes…) — for its customer and for staff */
  | { t: "order"; id: number; customerId: number | null }
  /** a new in-app notification for the customer (bell) */
  | { t: "notify"; customerId: number };

type Bus = { emitter: EventEmitter; pending: Map<number, NodeJS.Timeout>; owner: Map<number, { customerId: number | null; at: number }> };
const g = globalThis as unknown as { __liveBus?: Bus };
function bus(): Bus {
  if (!g.__liveBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // one listener per open screen
    g.__liveBus = { emitter, pending: new Map(), owner: new Map() };
  }
  return g.__liveBus;
}

export function onLive(fn: (e: LiveEvent) => void): () => void {
  const b = bus();
  b.emitter.on("e", fn);
  return () => b.emitter.off("e", fn);
}

/** customerId of an order — looked up once and kept (it never changes) */
let lookupOwner: ((orderId: number) => Promise<number | null>) | null = null;
export function setOwnerLookup(fn: (orderId: number) => Promise<number | null>) {
  lookupOwner = fn;
}

/** Several writes of one request (items + log + chat card…) become one event, ~40 ms after the last. */
export function orderChanged(orderId: number, customerId?: number | null): void {
  if (!Number.isInteger(orderId) || orderId <= 0) return;
  const b = bus();
  if (customerId) b.owner.set(orderId, { customerId, at: Date.now() });
  const t = b.pending.get(orderId);
  if (t) clearTimeout(t);
  b.pending.set(
    orderId,
    setTimeout(async () => {
      b.pending.delete(orderId);
      let owner = b.owner.get(orderId)?.customerId ?? null;
      if (owner == null && lookupOwner) {
        owner = await lookupOwner(orderId).catch(() => null);
        if (owner != null) b.owner.set(orderId, { customerId: owner, at: Date.now() });
      }
      if (b.owner.size > 5000) b.owner.clear();
      b.emitter.emit("e", { t: "order", id: orderId, customerId: owner } satisfies LiveEvent);
    }, 40)
  );
}

export function customerNotified(customerId: number): void {
  if (!Number.isInteger(customerId) || customerId <= 0) return;
  bus().emitter.emit("e", { t: "notify", customerId } satisfies LiveEvent);
}

// ── which writes mean «order N changed» (used by the Prisma extension in lib/prisma.ts) ──────────

const ORDER_CHILDREN = new Set(["OrderItem", "OrderMessage", "OrderItemChange", "OrderStatusLog"]);
const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);

function idsOf(v: unknown): number[] {
  if (typeof v === "number") return [v];
  if (v && typeof v === "object" && Array.isArray((v as { in?: unknown }).in)) return ((v as { in: unknown[] }).in).filter((x): x is number => typeof x === "number");
  return [];
}

/** Order ids touched by a write (from its result or its arguments); empty when unknown. */
export function touchedOrders(model: string | undefined, operation: string, args: unknown, result: unknown): { orderIds: number[]; customerIds: number[] } {
  const out = { orderIds: [] as number[], customerIds: [] as number[] };
  if (!model || !WRITES.has(operation)) return out;
  const a = (args ?? {}) as { where?: Record<string, unknown>; data?: unknown };
  const rows = (Array.isArray(result) ? result : result && typeof result === "object" ? [result] : []) as Record<string, unknown>[];
  if (model === "Order") {
    for (const r of rows) if (typeof r.id === "number") out.orderIds.push(r.id);
    if (!out.orderIds.length && a.where) out.orderIds.push(...idsOf(a.where.id));
  } else if (ORDER_CHILDREN.has(model)) {
    for (const r of rows) if (typeof r.orderId === "number") out.orderIds.push(r.orderId);
    if (!out.orderIds.length && a.where) out.orderIds.push(...idsOf(a.where.orderId));
    const data = Array.isArray(a.data) ? a.data : a.data ? [a.data] : [];
    if (!out.orderIds.length) for (const d of data as Record<string, unknown>[]) if (typeof d?.orderId === "number") out.orderIds.push(d.orderId);
  } else if (model === "Notification" && (operation === "create" || operation === "createMany")) {
    const data = Array.isArray(a.data) ? a.data : a.data ? [a.data] : [];
    for (const d of data as Record<string, unknown>[]) if (typeof d?.customerId === "number") out.customerIds.push(d.customerId);
  }
  out.orderIds = [...new Set(out.orderIds)];
  out.customerIds = [...new Set(out.customerIds)];
  return out;
}
