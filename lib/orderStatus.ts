/**
 * Canonical order-status definitions shared across admin, picker, API routes,
 * and customer-facing pages.
 */

/** Russian labels used in staff / admin views */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидание",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "На проверке",
  payment: "Заказ оформлен",
  exported: "Выгружен в 1С",
  cancelled: "Отменён",
};

/** Russian labels shown to the customer (softer language for some statuses) */
export const ORDER_STATUS_LABELS_CUSTOMER: Record<string, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "На проверке",
  payment: "Заказ оформлен",
  exported: "Выполнен",
  cancelled: "Отменён",
};

/**
 * Valid status transitions for server-side validation.
 * A status not present here has no allowed forward moves.
 */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["assembly", "cancelled"],
  approved: ["assembly", "cancelled"], // legacy status
  // «Заказ оформлен» only from «На проверке», after the customer confirmed the order
  assembly: ["pending", "consultation", "cancelled"],
  consultation: ["assembly", "payment", "cancelled"],
  payment: ["assembly", "consultation", "exported", "cancelled"],
  exported: [],
  cancelled: [],
};

/** UI button definitions rendered on the admin order detail page */
export const ORDER_STATUS_ACTIONS: Record<
  string,
  { label: string; to: string; style: string }[]
> = {
  // «Собрать заказ» (to assembly + open the picker's screen) is a separate button on the order page
  pending: [
    { label: "✕ Отменить заказ", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  approved: [
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  // the manager collects the order himself and changes it only here; then sends it to the customer to check
  assembly: [
    { label: "📨 Отправить клиенту на проверку", to: "consultation", style: "bg-orange-100 hover:bg-orange-200 text-orange-700" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  // «Заказ оформлен» is offered only after the customer confirmed the order
  consultation: [
    { label: "↩ Вернуть на сборку", to: "assembly", style: "bg-blue-100 hover:bg-blue-200 text-blue-700" },
    { label: "✓ Заказ оформлен", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  payment: [
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
};

/**
 * When the customer may change the order himself (quantities, remove, add products): only before the
 * manager starts collecting it («Ожидание», «Подтверждён»). During «Сборка» only the manager changes it,
 * on «На проверке» the customer checks and confirms (or writes to the manager in the chat).
 */
export const CUSTOMER_EDITABLE_STATUSES = ["pending", "approved"];

/** Why the customer can't change the order now (shown instead of «Изменить»), or null. */
export function customerEditBlockedReason(status: string): string | null {
  if (CUSTOMER_EDITABLE_STATUSES.includes(status)) return null;
  if (status === "assembly") return "Менеджер собирает заказ — изменить его сейчас можно только через менеджера в чате заказа.";
  if (status === "consultation") return "Заказ собран — проверьте его и подтвердите. Если что-то не так, напишите менеджеру в чате заказа.";
  if (status === "payment" || status === "exported") return "Заказ уже оформлен — изменить его нельзя. Напишите менеджеру в чате заказа.";
  return "Этот заказ изменить нельзя.";
}
