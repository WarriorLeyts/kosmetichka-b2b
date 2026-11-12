import type { Prisma } from "@prisma/client";

/**
 * Where an order stands with 1С, for the admin panel. It is worked out from the fields lib/onecOrders.ts
 * already keeps (no separate status column, so the sending logic stays as it is):
 *  synced  — the document is in 1С (oneCExportedAt / «Выгружен в 1С»);
 *  sending — a send is running now (claim younger than 10 min);
 *  failed  — the last try ended with an error (oneCError), the next try is at oneCNextTryAt;
 *  pending — ready («Заказ оформлен»), waits for its send;
 *  waiting — the manager hasn't finished the order yet: it goes to 1С at «Заказ оформлен»;
 *  none    — cancelled, never goes to 1С.
 */
export type SyncState = "synced" | "sending" | "failed" | "pending" | "waiting" | "none";

/** the same as READY / CLAIM_STALE_MS in lib/onecOrders.ts */
export const READY_STATUSES = ["payment", "approved"];
export const CLAIM_STALE_MS = 10 * 60_000;

export const SYNC_LABELS: Record<SyncState, string> = {
  synced: "Передан в 1С",
  sending: "Отправляется",
  failed: "Ошибка",
  pending: "Ожидает отправки",
  waiting: "Ждёт оформления",
  none: "—",
};

type SyncFields = { status: string; oneCExportedAt: Date | string | null; oneCError: string | null; oneCSendingAt: Date | string | null };

export function syncState(o: SyncFields, now = new Date()): SyncState {
  if (o.oneCExportedAt || o.status === "exported") return "synced";
  if (o.status === "cancelled") return "none";
  if (!READY_STATUSES.includes(o.status)) return "waiting";
  if (o.oneCSendingAt && now.getTime() - new Date(o.oneCSendingAt).getTime() < CLAIM_STALE_MS) return "sending";
  if (o.oneCError) return "failed";
  return "pending";
}

/** `where` for the «Обмен с 1С» filter; «unsynced» — «Не передано в 1С»: ready, but no document yet */
export function syncWhere(f: string, now = new Date()): Prisma.OrderWhereInput {
  const fresh = new Date(now.getTime() - CLAIM_STALE_MS);
  const ready: Prisma.OrderWhereInput = { status: { in: READY_STATUSES }, oneCExportedAt: null };
  const notSending: Prisma.OrderWhereInput = { OR: [{ oneCSendingAt: null }, { oneCSendingAt: { lt: fresh } }] };
  switch (f) {
    case "unsynced":
      return ready;
    case "synced":
      return { OR: [{ oneCExportedAt: { not: null } }, { status: "exported" }] };
    case "sending":
      return { ...ready, oneCSendingAt: { gte: fresh } };
    case "failed":
      return { AND: [ready, notSending, { oneCError: { not: null } }] };
    case "pending":
      return { AND: [ready, notSending, { oneCError: null }] };
    case "waiting":
      return { status: { notIn: [...READY_STATUSES, "exported", "cancelled"] }, oneCExportedAt: null };
    default:
      return {};
  }
}

/** «СА-000231», «231», «№231» → 231 */
export function orderIdFromQuery(q: string): number | null {
  const m = q.trim().match(/^(?:№\s*)?(?:С[АК]-?)?0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}

export const TRIGGER_LABELS: Record<string, string> = {
  immediate: "Сразу после оформления",
  auto: "Повтор по расписанию",
  manual: "Вручную из админ-панели",
};

export const OUTCOME_LABELS: Record<string, string> = {
  created: "Документ создан",
  linked: "Документ уже был в 1С — связан",
  problem: "Не отправлен: данные",
  error: "Ошибка 1С / сети",
};
