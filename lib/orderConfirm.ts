import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

/**
 * Staff changed an order → the customer must confirm before it can become «Заказ оформлен» (payment).
 *   requestConfirmation — after a staff change of the items (admin, Team, Bitrix24);
 *   clearConfirmation   — the customer confirmed, or changed the order himself;
 *   isAwaiting          — payment is blocked (status change, bulk change, picker, Bitrix).
 * Reminders: a push 2 h after the request and again after 24 h (startConfirmReminders).
 */

export const AWAITING_CONFIRMATION =
  "Ждём подтверждения клиента: заказ изменён, клиент ещё не подтвердил изменения. «Заказ оформлен» станет доступен после его подтверждения.";

export function isAwaiting(order: { confirmRequestedAt?: Date | null }): boolean {
  return !!order.confirmRequestedAt;
}

export async function requestConfirmation(orderId: number): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: { confirmRequestedAt: new Date(), confirmReminders: 0, customerConfirmed: false },
  });
}

export async function clearConfirmation(orderId: number): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { confirmRequestedAt: null, customerConfirmed: true } });
}

const HOUR = 3600e3;
/** after these delays from the request: 1st and 2nd reminder */
export const REMINDER_DELAYS = [2 * HOUR, 24 * HOUR];

/** Sends the reminders that are due. Returns how many were sent. Never throws. */
export async function sendConfirmReminders(now = new Date()): Promise<number> {
  let sent = 0;
  try {
    for (let i = 0; i < REMINDER_DELAYS.length; i++) {
      const due = await prisma.order.findMany({
        where: {
          confirmRequestedAt: { not: null, lte: new Date(now.getTime() - REMINDER_DELAYS[i]) },
          confirmReminders: i,
          status: { in: ["pending", "approved", "assembly", "consultation"] },
        },
        select: { id: true, customerId: true },
        take: 200,
      });
      for (const o of due) {
        // claim first: two server instances never send the same reminder twice
        const claimed = await prisma.order.updateMany({ where: { id: o.id, confirmReminders: i }, data: { confirmReminders: i + 1 } });
        if (claimed.count === 0) continue;
        await notify(o.customerId, {
          kind: "order",
          title: `Подтвердите изменения в заказе №${o.id}`,
          body: "Менеджер изменил заказ и ждёт вашего подтверждения. Без него заказ не будет оформлен.",
          link: `/order/${o.id}`,
        });
        sent++;
      }
    }
  } catch (e) {
    console.error("[confirm-reminders]", e instanceof Error ? e.message : e);
  }
  return sent;
}

const g = globalThis as unknown as { __confirmReminderTimer?: ReturnType<typeof setInterval> };

/** Checks every 10 minutes (started once per server in instrumentation.ts). */
export function startConfirmReminders(everyMs = 10 * 60e3): void {
  if (g.__confirmReminderTimer) return;
  g.__confirmReminderTimer = setInterval(() => void sendConfirmReminders(), everyMs);
}
