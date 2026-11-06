import { prisma } from "@/lib/prisma";

/** The shop works 9:00–19:00 Moscow time; an order placed from 18:40 until 9:00 gets a note in its chat. */
const OPEN_MIN = 9 * 60;
const LATE_MIN = 18 * 60 + 40;

export const AFTER_HOURS_TEXT =
  "Спасибо за заказ! 💜 Наш магазин работает с 9:00 до 19:00. Ваш заказ уже у нас, и менеджер обязательно свяжется с вами в рабочее время. Спасибо, что выбираете Косметичку!";

/** minutes since midnight in Moscow */
export function moscowMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function isAfterHours(at: Date): boolean {
  const m = moscowMinutes(at);
  return m >= LATE_MIN || m < OPEN_MIN;
}

/** A late order: the shop's note in the order chat, as from the manager (isFromPicker). Never throws. */
export async function afterHoursNote(orderId: number, at: Date = new Date()): Promise<boolean> {
  if (!isAfterHours(at)) return false;
  try {
    await prisma.orderMessage.create({ data: { orderId, source: "customer", isFromPicker: true, text: AFTER_HOURS_TEXT } });
    return true;
  } catch (e) {
    console.error("[after-hours] chat:", e instanceof Error ? e.message : e);
    return false;
  }
}
