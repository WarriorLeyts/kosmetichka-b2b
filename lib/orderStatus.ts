/**
 * Canonical order-status definitions shared across admin, picker, API routes,
 * and customer-facing pages.
 */

/** Russian labels used in staff / admin views */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидание",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "Консультация",
  payment: "Заказ оформлен",
  exported: "Выгружен в 1С",
  cancelled: "Отменён",
};

/** Russian labels shown to the customer (softer language for some statuses) */
export const ORDER_STATUS_LABELS_CUSTOMER: Record<string, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "На консультации",
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
  approved: ["assembly", "payment", "cancelled"], // legacy status
  assembly: ["pending", "approved", "consultation", "payment", "cancelled"],
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
    { label: "✓ Заказ оформлен", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  assembly: [
    { label: "💬 На консультацию", to: "consultation", style: "bg-orange-100 hover:bg-orange-200 text-orange-700" },
    { label: "✓ Заказ оформлен", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  consultation: [
    { label: "↩ Вернуть на сборку", to: "assembly", style: "bg-blue-100 hover:bg-blue-200 text-blue-700" },
    { label: "✓ Подтвердить: заказ оформлен", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  payment: [
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
};

/**
 * When the customer may change the order himself (quantities, remove, add products): before the
 * picker starts («Ожидание», «Подтверждён») and on «Консультация». Not during «Сборка» (the picker
 * is collecting — changes go through the manager in the chat), not once it is «Заказ оформлен».
 */
export const CUSTOMER_EDITABLE_STATUSES = ["pending", "approved", "consultation"];

/** Why the customer can't change the order now (shown instead of «Изменить»), or null. */
export function customerEditBlockedReason(status: string): string | null {
  if (CUSTOMER_EDITABLE_STATUSES.includes(status)) return null;
  if (status === "assembly") return "Заказ собирается — изменить его сейчас можно только через менеджера в чате заказа.";
  if (status === "payment" || status === "exported") return "Заказ уже оформлен — изменить его нельзя. Напишите менеджеру в чате заказа.";
  return "Этот заказ изменить нельзя.";
}
