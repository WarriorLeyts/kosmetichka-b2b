import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ONLY_GROUPS } from "@/lib/staffScope";
import { getVapidConfig, sendToSubscriptions, type WebPushPayload } from "@/lib/webPush";
import { sendPush } from "@/lib/notify";

/**
 * Web Push for staff (admin / manager) on the admin website (/admin, the Team web app):
 * new order, a customer's chat message, the customer confirmed / cancelled the order.
 * Never throws; route handlers call the *Later variants (fire-and-forget).
 */

export type StaffEvent =
  | { kind: "new-order"; orderId: number }
  | { kind: "chat"; orderId: number; text: string }
  | { kind: "confirmed"; orderId: number }
  | { kind: "cancelled"; orderId: number }
  /** a customer waits for a decision on a wholesale price type: at sign-up, or a retail customer moving up */
  | { kind: "customer-request"; customerId: number; request: "wholesale" | "big_wholesale"; signup: boolean };

/** who gets staff notifications (current role of the account) */
export const STAFF_PUSH_ROLES = ["admin", "manager"];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

type Client = { name: string | null; companyName: string | null; phone: string | null } | null;
export const clientLabel = (c: Client, customerId?: number) =>
  (c?.companyName || c?.name || c?.phone || (customerId ? `Клиент #${customerId}` : "Клиент")).trim();

/** One line for a chat message: plain text, or a short label for cards (product request, photo, file…). */
export function chatPreview(text: string): string {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      const m = JSON.parse(t) as { _t?: string; name?: string; variantName?: string | null; quantity?: number };
      if (m?._t === "product-request") {
        const name = [m.name, m.variantName].filter(Boolean).join(" — ");
        return `🛒 Клиент просит добавить: ${name || "товар"}${m.quantity ? ` × ${m.quantity}` : ""}`;
      }
      if (m?._t === "img") return "📷 Фото";
      if (m?._t === "video") return "🎬 Видео";
      if (m?._t === "file") return `📎 Файл${m.name ? `: ${m.name}` : ""}`;
      if (m?._t) return "Сообщение";
    } catch {
      /* plain text */
    }
  }
  return clip(t.replace(/\s+/g, " "), 180) || "Новое сообщение";
}

const rub = (n: number) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;

const LEVEL = { wholesale: "опт", big_wholesale: "крупный опт" } as const;

async function customerPayload(ev: Extract<StaffEvent, { kind: "customer-request" }>): Promise<WebPushPayload | null> {
  const c = await prisma.customer.findUnique({
    where: { id: ev.customerId },
    select: { name: true, companyName: true, phone: true },
  });
  if (!c) return null;
  const path = `/customer/${ev.customerId}`;
  return {
    link: `/admin${path}`,
    path,
    kind: "staff-customer",
    tag: `c${ev.customerId}-${ev.request}`,
    title: ev.signup ? `Заявка на регистрацию: ${LEVEL[ev.request]}` : `Переход на ${LEVEL[ev.request]}`,
    body: [clientLabel(c, ev.customerId), c.phone && c.phone !== clientLabel(c) ? c.phone : null].filter(Boolean).join(" · "),
  };
}

/** Builds the notification for an event (null when the order is gone). */
export async function staffPayload(ev: StaffEvent): Promise<WebPushPayload | null> {
  if (ev.kind === "customer-request") return customerPayload(ev);
  const o = await prisma.order.findUnique({
    where: { id: ev.orderId },
    select: { id: true, total: true, customerId: true, customer: { select: { name: true, companyName: true, phone: true } } },
  });
  if (!o) return null;
  const who = clientLabel(o.customer, o.customerId);
  const path = `/order/${o.id}`;
  const base = { link: `/admin${path}`, path };
  switch (ev.kind) {
    case "new-order":
      return { ...base, kind: "staff-order", tag: `o${o.id}-new`, title: `Новый заказ №${o.id}`, body: `${who} · ${rub(o.total)}` };
    case "chat":
      return { ...base, kind: "staff-chat", tag: `o${o.id}-chat`, title: `Сообщение по заказу №${o.id}`, body: clip(`${who}: ${chatPreview(ev.text)}`, 200) };
    case "confirmed":
      return { ...base, kind: "staff-order", tag: `o${o.id}-confirm`, title: `Клиент подтвердил заказ №${o.id}`, body: `${who} · ${rub(o.total)}` };
    case "cancelled":
      return { ...base, kind: "staff-order", tag: `o${o.id}-cancel`, title: `Клиент отменил заказ №${o.id}`, body: who };
  }
}

/**
 * Who hears about the event: admins, and the manager whose 1С group the customer is in (lib/staffScope.ts).
 * Customers without a manager (or of «Раяна» / «Отдел Продаж») — admins only.
 */
export async function recipientsWhere(ev: StaffEvent): Promise<Prisma.UserWhereInput> {
  const c =
    ev.kind === "customer-request"
      ? await prisma.customer.findUnique({ where: { id: ev.customerId }, select: { manager: true } })
      : (await prisma.order.findUnique({ where: { id: ev.orderId }, select: { customer: { select: { manager: true } } } }))?.customer;
  const group = c?.manager?.trim() || null;
  return group && !ADMIN_ONLY_GROUPS.includes(group) ? { OR: [{ role: "admin" }, { role: "manager", oneCGroup: group }] } : { role: "admin" };
}

/** Pushes an event to the browsers and Team phones of its recipients (except `exceptUserId`). Returns delivered count. */
export async function notifyStaff(ev: StaffEvent, opts: { exceptUserId?: number | null } = {}): Promise<number> {
  const who = await recipientsWhere(ev).catch(() => ({ role: "admin" }) as Prisma.UserWhereInput);
  const [web, phones] = await Promise.all([notifyStaffBrowsers(ev, opts, who), notifyStaffPhones(ev, opts, who)]);
  return web + phones;
}

/**
 * The staff app «Косметичка Team» on phones: Expo push (FCM on Android) to the tokens it registered
 * (/api/team/push-token). Tapping the notification opens the order.
 */
async function notifyStaffPhones(ev: StaffEvent, opts: { exceptUserId?: number | null }, who: Prisma.UserWhereInput): Promise<number> {
  try {
    const tokens = await prisma.staffPushToken.findMany({
      where: {
        user: { AND: [{ role: { in: STAFF_PUSH_ROLES } }, who] },
        ...(opts.exceptUserId ? { userId: { not: opts.exceptUserId } } : {}),
      },
      select: { token: true },
    });
    if (tokens.length === 0) return 0;
    const payload = await staffPayload(ev);
    if (!payload) return 0;
    return await sendPush(
      tokens.map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        data: { link: payload.path ?? null, path: payload.path, kind: payload.kind ?? "staff" },
        sound: "default",
        channelId: "staff",
        priority: "high",
      })),
      (gone) => prisma.staffPushToken.deleteMany({ where: { token: { in: gone } } })
    );
  } catch (e) {
    console.error("[staff-push] phones", e instanceof Error ? e.message : e);
    return 0;
  }
}

async function notifyStaffBrowsers(ev: StaffEvent, opts: { exceptUserId?: number | null }, who: Prisma.UserWhereInput): Promise<number> {
  const cfg = getVapidConfig();
  if (!cfg) return 0;
  try {
    const subs = await prisma.staffWebPushSubscription.findMany({
      where: {
        user: { AND: [{ role: { in: STAFF_PUSH_ROLES } }, who] },
        ...(opts.exceptUserId ? { userId: { not: opts.exceptUserId } } : {}),
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return 0;
    const payload = await staffPayload(ev);
    if (!payload) return 0;
    const { ok, gone } = await sendToSubscriptions(subs, payload, cfg, "high");
    if (gone.length) await prisma.staffWebPushSubscription.deleteMany({ where: { id: { in: gone } } });
    return ok;
  } catch (e) {
    console.error("[staff-push]", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Fire-and-forget for route handlers: never delays or breaks the response. */
export function notifyStaffLater(ev: StaffEvent, opts: { exceptUserId?: number | null } = {}): void {
  void notifyStaff(ev, opts).catch(() => {});
}
