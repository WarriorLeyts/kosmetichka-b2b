/** Pausing an order keeps its contents, picking checks and customer confirmation intact. */
export const CONTACT_HOLD_STATUSES = ["pending", "approved", "assembly", "consultation", "payment"];

export type ContactOrder = {
  status: string;
  oneCExportedAt?: unknown;
  oneCSendingAt?: unknown;
  oneCRef?: string | null;
  oneCStockRef?: string | null;
};

/** An export already claimed or partly created in 1C must finish before staff can pause the order. */
export function canHoldForContact(order: ContactOrder): boolean {
  return CONTACT_HOLD_STATUSES.includes(order.status)
    && !order.oneCExportedAt && !order.oneCSendingAt && !order.oneCRef && !order.oneCStockRef;
}

/** The most recent pause records exactly which stage to restore. No client-supplied target stage. */
export function contactResumeStatus(logs: { id: number; fromStatus: string | null; toStatus: string }[]): string | null {
  const last = logs.filter(log => log.toStatus === "no_contact").sort((a, b) => b.id - a.id)[0];
  return last?.fromStatus && CONTACT_HOLD_STATUSES.includes(last.fromStatus) ? last.fromStatus : null;
}
