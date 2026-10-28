import { prisma } from "@/lib/prisma";

/**
 * Latest customer chat messages per order, for the staff «new message» marks:
 * lastCustomerMessageId / At — the newest message written by the customer (incl. their confirm / change lines);
 * lastStaffMessageId — the newest staff reply (a reply after it means someone has seen it).
 * Two grouped queries on the (orderId, source) index.
 */
export type ChatMarks = { lastCustomerMessageId: number | null; lastCustomerMessageAt: string | null; lastStaffMessageId: number | null };

export async function customerChatMarks(orderIds: number[]): Promise<Map<number, ChatMarks>> {
  const out = new Map<number, ChatMarks>();
  if (orderIds.length === 0) return out;
  const [cust, staff] = await Promise.all([
    prisma.orderMessage.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orderIds }, source: "customer", isFromPicker: false },
      _max: { id: true, createdAt: true },
    }),
    prisma.orderMessage.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orderIds }, source: "customer", isFromPicker: true },
      _max: { id: true },
    }),
  ]);
  for (const id of orderIds) out.set(id, { lastCustomerMessageId: null, lastCustomerMessageAt: null, lastStaffMessageId: null });
  for (const c of cust) {
    const m = out.get(c.orderId)!;
    m.lastCustomerMessageId = c._max.id ?? null;
    m.lastCustomerMessageAt = c._max.createdAt ? c._max.createdAt.toISOString() : null;
  }
  for (const s of staff) out.get(s.orderId)!.lastStaffMessageId = s._max.id ?? null;
  return out;
}

export const EMPTY_MARKS: ChatMarks = { lastCustomerMessageId: null, lastCustomerMessageAt: null, lastStaffMessageId: null };
