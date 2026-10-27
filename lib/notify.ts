import { prisma } from "@/lib/prisma";

/**
 * Customer notifications: a row in «Уведомления» (the app's bell) + a push to every device of
 * the customer (Expo push service → FCM on Android). Never throws: a failed push must not break
 * an order, a status change or a chat message. Push needs nothing on our side but the Expo
 * project's FCM key; EXPO_ACCESS_TOKEN is optional (only if "enhanced push security" is on).
 */

export type NotifyKind = "order" | "chat" | "restock" | "bonus" | "role" | "promo";
export type NotifyMessage = { kind: NotifyKind; title: string; body: string; link?: string | null };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { link: string | null; kind: NotifyKind };
  sound: "default";
  channelId: string;
  priority: "high" | "default";
};

/** Sends push messages in chunks of 100; tokens Expo reports as gone are deleted. Returns delivered count. */
export async function sendPush(messages: ExpoMessage[]): Promise<number> {
  let ok = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[]; errors?: unknown } | null;
      const tickets = data?.data ?? [];
      const gone: string[] = [];
      tickets.forEach((t, k) => {
        if (t.status === "ok") ok++;
        else if (t.details?.error === "DeviceNotRegistered") gone.push(chunk[k].to);
        else console.error("[push] ticket error:", t.details?.error ?? t);
      });
      if (!res.ok) console.error("[push] expo responded", res.status, JSON.stringify(data?.errors ?? "").slice(0, 300));
      if (gone.length) await prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
    } catch (e) {
      console.error("[push] send failed:", e instanceof Error ? e.message : e);
    }
  }
  return ok;
}

/** Saves the notification for each customer and pushes it to their devices. */
export async function notify(customerIds: number | number[], msg: NotifyMessage): Promise<{ customers: number; devices: number }> {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : [customerIds]).filter((x) => Number.isInteger(x) && x > 0))];
  if (ids.length === 0) return { customers: 0, devices: 0 };
  const title = msg.title.slice(0, 120);
  const body = msg.body.slice(0, 1000);
  const link = msg.link ?? null;
  try {
    for (let i = 0; i < ids.length; i += 1000) {
      await prisma.notification.createMany({
        data: ids.slice(i, i + 1000).map((customerId) => ({ customerId, kind: msg.kind, title, body, link })),
      });
    }
    const tokens = await prisma.pushToken.findMany({ where: { customerId: { in: ids } }, select: { token: true } });
    const devices = await sendPush(
      tokens.map((t) => ({
        to: t.token,
        title,
        body: body.length > 180 ? body.slice(0, 177) + "…" : body,
        data: { link, kind: msg.kind },
        sound: "default",
        channelId: msg.kind === "promo" ? "promo" : "default",
        priority: msg.kind === "promo" ? "default" : "high",
      }))
    );
    return { customers: ids.length, devices };
  } catch (e) {
    console.error("[notify] failed:", e instanceof Error ? e.message : e);
    return { customers: 0, devices: 0 };
  }
}

/** Fire-and-forget variant for request handlers: the response doesn't wait for Expo. */
export function notifyLater(customerIds: number | number[], msg: NotifyMessage): void {
  void notify(customerIds, msg);
}

// ── order events ───────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, (id: number) => { title: string; body: string }> = {
  approved: (id) => ({ title: `Заказ №${id} подтверждён`, body: "Менеджер подтвердил заказ, скоро начнём сборку." }),
  assembly: (id) => ({ title: `Заказ №${id} собирается`, body: "Собираем ваш заказ." }),
  consultation: (id) => ({ title: `Нужно уточнение по заказу №${id}`, body: "Менеджер свяжется с вами или напишет в чате заказа." }),
  payment: (id) => ({ title: `Заказ №${id} собран`, body: "Заказ собран и ждёт оплаты. Подробности — в заказе." }),
  exported: (id) => ({ title: `Заказ №${id} выполнен`, body: "Спасибо за покупку!" }),
  cancelled: (id) => ({ title: `Заказ №${id} отменён`, body: "Если это ошибка, напишите менеджеру в чате заказа." }),
};

/** Status changed by staff / 1C (a customer's own cancel is not announced back to them). */
export async function notifyOrderStatus(orderIds: number | number[], status: string): Promise<void> {
  const text = STATUS_TEXT[status];
  if (!text) return;
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter((x) => Number.isInteger(x) && x > 0);
  if (ids.length === 0) return;
  try {
    const orders = await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, customerId: true } });
    for (const o of orders) {
      const t = text(o.id);
      await notify(o.customerId, { kind: "order", title: t.title, body: t.body, link: `/order/${o.id}` });
    }
  } catch (e) {
    console.error("[notify] order status:", e instanceof Error ? e.message : e);
  }
}

/** A manager wrote in the order chat (site admin, Team app, Bitrix). */
export async function notifyManagerMessage(orderId: number, text: string): Promise<void> {
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!o) return;
    const body = text.replace(/\s+/g, " ").trim();
    await notify(o.customerId, {
      kind: "chat",
      title: `Сообщение по заказу №${orderId}`,
      body: body.length > 300 ? body.slice(0, 297) + "…" : body || "Новое сообщение от менеджера",
      link: `/order/${orderId}`,
    });
  } catch (e) {
    console.error("[notify] chat:", e instanceof Error ? e.message : e);
  }
}

/** MAXMA confirmed a completed order: the accrued bonuses are now on the card. */
export async function notifyBonusesAccrued(orderId: number): Promise<void> {
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, bonusesCollected: true } });
    if (!o || o.bonusesCollected <= 0) return;
    await notify(o.customerId, {
      kind: "bonus",
      title: `Начислено ${o.bonusesCollected} ${plural(o.bonusesCollected, "бонус", "бонуса", "бонусов")}`,
      body: `За заказ №${orderId}. Их можно списать при следующей покупке.`,
      link: `/order/${orderId}`,
    });
  } catch (e) {
    console.error("[notify] bonuses:", e instanceof Error ? e.message : e);
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
