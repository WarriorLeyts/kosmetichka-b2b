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
  payment: "К оплате",
  exported: "Выгружен в 1С",
  cancelled: "Отменён",
};

/** Russian labels shown to the customer (softer language for some statuses) */
export const ORDER_STATUS_LABELS_CUSTOMER: Record<string, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтверждён",
  assembly: "Сборка",
  consultation: "На консультации",
  payment: "К оплате",
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
  pending: [
    { label: "▶ Передать на сборку", to: "assembly", style: "bg-blue-600 hover:bg-blue-700 text-white" },
    { label: "✕ Отменить заказ", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  approved: [
    { label: "▶ Передать на сборку", to: "assembly", style: "bg-blue-600 hover:bg-blue-700 text-white" },
    { label: "✓ К оплате", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  assembly: [
    { label: "💬 На консультацию", to: "consultation", style: "bg-orange-100 hover:bg-orange-200 text-orange-700" },
    { label: "✓ К оплате", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  consultation: [
    { label: "↩ Вернуть на сборку", to: "assembly", style: "bg-blue-100 hover:bg-blue-200 text-blue-700" },
    { label: "✓ Подтвердить к оплате", to: "payment", style: "bg-green-600 hover:bg-green-700 text-white" },
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
  payment: [
    { label: "✕ Отменить", to: "cancelled", style: "bg-red-100 hover:bg-red-200 text-red-700" },
  ],
};
