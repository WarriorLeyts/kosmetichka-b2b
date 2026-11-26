import { isAfterHours, moscowMinutes } from "./afterHours";

type ServiceOrder = { status: string; createdAt: Date | string; customerConfirmed?: boolean; serviceStartedAt?: Date | string | null; serviceManagerName?: string | null };
export type OrderService = {
  phase: "queued" | "checking" | "assembly" | "confirmation" | "processing" | "paused" | "done" | "cancelled";
  title: string; description: string; timingText: string | null; expectedAt: string | null;
  overdue: boolean; managerName: string | null; startedAt: string | null; canTake: boolean;
};
/** No response deadline is promised unless a processing window is explicitly configured. */
export function responseWindowMinutes(): number {
  const n = Number(process.env.ORDER_SERVICE_RESPONSE_MINUTES || 0);
  return Number.isInteger(n) && n > 0 && n <= 240 ? n : 0;
}
const moscowDay = (d: Date) => new Date(new Date(d.getTime() + 10800000).toISOString().slice(0, 10) + "T00:00:00+03:00");
/** Uses the existing late-order cutoff, 18:40, and 09:00–19:00 Moscow processing hours. */
export function responseExpectedAt(created: Date, minutes: number): Date {
  let cursor = new Date(created);
  const m = moscowMinutes(cursor), day = moscowDay(cursor);
  if (m < 540) cursor = new Date(day.getTime() + 540 * 60000);
  else if (m >= 1120) cursor = new Date(day.getTime() + (1440 + 540) * 60000);
  let remaining = minutes * 60000;
  while (remaining > 0) {
    const close = moscowDay(cursor).getTime() + 1140 * 60000;
    const available = close - cursor.getTime();
    if (remaining <= available) return new Date(cursor.getTime() + remaining);
    remaining -= available;
    cursor = new Date(moscowDay(cursor).getTime() + (1440 + 540) * 60000);
  }
  return cursor;
}

export function orderReceiptText(at = new Date(), minutes = responseWindowMinutes()): string {
  const late = isAfterHours(at);
  return "Ваш заказ получен 💜 " + (late
    ? "Он в очереди на обработку. Магазин работает с 09:00 до 19:00 по Москве. Менеджер вернётся к вашему заказу в рабочее время. "
    : "Он в очереди на проверку. Менеджер проверит наличие и напишет вам здесь. ")
    + (minutes ? `Ориентир по проверке — ${minutes === 60 ? "один рабочий час" : `${minutes} рабочих минут`}. ` : "Обрабатываем заказы по очереди. ")
    + "Повторно оформлять заказ не нужно.";
}

export function orderService(order: ServiceOrder, now = new Date(), minutes = responseWindowMinutes()): OrderService {
  const created = new Date(order.createdAt), name = order.serviceManagerName || null;
  const base = { timingText: null, expectedAt: null, overdue: false, managerName: name, startedAt: order.serviceStartedAt ? new Date(order.serviceStartedAt).toISOString() : null, canTake: false };
  if (order.status === "cancelled") return { ...base, phase: "cancelled", title: "Заказ отменён", description: "Если остались вопросы, напишите менеджеру в чате заказа." };
  if (order.status === "exported") return { ...base, phase: "done", title: "Заказ выполнен", description: "Спасибо за покупку! По вопросам заказа можно написать в чат." };
  if (order.status === "no_contact") return { ...base, phase: "paused", title: "Ожидаем связи с вами", description: "Обработка заказа приостановлена. Напишите менеджеру в чате, чтобы продолжить." };
  if (order.status === "assembly") return { ...base, phase: "assembly", title: "Собираем ваш заказ", description: "Проверяем товары при сборке. Когда заказ будет готов, сообщим вам и при необходимости согласуем замены." };
  if (order.status === "consultation") return { ...base, phase: "confirmation", title: order.customerConfirmed ? "Вы подтвердили заказ" : "Ждём вашего подтверждения", description: order.customerConfirmed ? "Спасибо! Менеджер продолжит оформление и согласует с вами оплату и получение." : "Заказ собран. Проверьте состав и сумму и нажмите «Подтвердить заказ». Если есть вопросы — напишите в чат." };
  if (order.status === "payment") return { ...base, phase: "processing", title: "Заказ оформлен", description: "Состав и сумма согласованы. Менеджер свяжется с вами по оплате и получению заказа." };
  const checking = !!order.serviceStartedAt || order.status === "approved";
  const expected = minutes ? responseExpectedAt(created, minutes) : null;
  const overdue = !!expected && expected <= now;
  let timingText = checking ? "Следующий шаг: результат проверки в чате" : isAfterHours(now) ? "Обработка заказов: 09:00–19:00 МСК" : "Обрабатываем заказы по очереди";
  if (expected) {
    const sameDay = moscowDay(now).getTime() === moscowDay(expected).getTime();
    const label = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", ...(sameDay ? {} : { day: "numeric", month: "long" }), hour: "2-digit", minute: "2-digit" }).format(expected);
    timingText = overdue ? checking ? "Проверка заняла больше времени. Менеджер уточнит срок в чате." : "Ответ задерживается. Заказ остаётся в очереди — менеджер напишет вам." : `Ориентир по проверке: ${sameDay ? "до " : ""}${label} МСК`;
  }
  return { ...base, phase: checking ? "checking" : "queued", title: checking ? "Ваш заказ уже в работе" : "Мы получили ваш заказ",
    description: checking ? `${name ? `Менеджер ${name} проверяет` : "Проверяем"} наличие и сумму. Если понадобится замена, сначала согласуем её с вами.` : isAfterHours(now) ? "Заказ в очереди. Менеджер вернётся к нему в рабочее время и напишет вам здесь. Повторно оформлять заказ не нужно." : "Заказ в очереди на проверку. Менеджер проверит наличие и напишет вам в чате. Повторно оформлять заказ не нужно.",
    timingText, expectedAt: expected?.toISOString() ?? null, overdue, canTake: !checking && ["pending", "approved"].includes(order.status) };
}
