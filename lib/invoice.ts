import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS, ORDER_STATUS_LABELS_CUSTOMER } from "@/lib/orderStatus";
import { SHOP_ADDRESS } from "@/lib/delivery";

/** Everything printed on an invoice (HTML pages /orders/N/invoice, /admin/orders/N/invoice and the PDF). */
export type InvoiceData = {
  id: number;
  issueDate: string;
  statusLabel: string;
  supplier: { name: string; lines: string[] };
  buyer: { name: string; lines: string[]; manager: string | null };
  /** «Способ получения»: what the customer chose in the cart */
  delivery: { title: string; text: string | null } | null;
  items: { name: string; variant: string | null; code: string | null; quantity: number; price: number; total: number }[];
  totals: { label: string; value: string; strong?: boolean }[];
  comment: string | null;
};

const rub = (n: number) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;

/** How the order is received — «Самовывоз» with the shop's address, or the delivery address the customer gave. */
export function deliveryLine(deliveryType: string | null, deliveryAddress: string | null): InvoiceData["delivery"] {
  if (deliveryType === "pickup") return { title: "Самовывоз", text: SHOP_ADDRESS };
  if (deliveryType === "delivery") return { title: "Доставка", text: deliveryAddress?.trim() || "адрес уточняется" };
  return null; // orders placed before the choice existed
}

/** Supplier block: name + the requisites from the environment (SHOP_*), when they are set. */
function supplier(): InvoiceData["supplier"] {
  const e = process.env;
  const lines = [
    e.SHOP_INN && `ИНН: ${e.SHOP_INN}`,
    e.SHOP_KPP && `КПП: ${e.SHOP_KPP}`,
    e.SHOP_ADDRESS,
    e.SHOP_BANK,
    e.SHOP_BIK && `БИК: ${e.SHOP_BIK}`,
    e.SHOP_ACCOUNT && `р/с: ${e.SHOP_ACCOUNT}`,
    e.SHOP_CORR_ACCOUNT && `к/с: ${e.SHOP_CORR_ACCOUNT}`,
  ].filter((x): x is string => !!x);
  if (!e.SHOP_INN) lines.push("kosmetichka-opt.ru");
  return { name: e.SHOP_NAME || "ООО «Косметичка»", lines };
}

/** The invoice of order `id`, or null when there is no such order. `customer` — the customer's status names. */
export async function loadInvoice(id: number, audience: "staff" | "customer"): Promise<(InvoiceData & { customerId: number }) | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, items: { orderBy: { id: "asc" } } },
  });
  if (!order) return null;
  const c = order.customer;
  const labels = audience === "customer" ? ORDER_STATUS_LABELS_CUSTOMER : ORDER_STATUS_LABELS;

  const totals: InvoiceData["totals"] = [];
  if (order.discount > 0 || order.bonusesApplied > 0)
    totals.push({ label: "Сумма без скидки:", value: rub(order.total + order.discount + order.bonusesApplied) });
  if (order.discount > 0) totals.push({ label: order.promoCode ? `Скидки (включая промокод ${order.promoCode}):` : "Скидка на заказ:", value: `−${rub(order.discount)}` });
  if (order.bonusesApplied > 0) totals.push({ label: "Списано бонусов:", value: `−${rub(order.bonusesApplied)}` });
  totals.push({ label: "ИТОГО:", value: rub(order.total), strong: true });
  if (order.bonusesCollected > 0) totals.push({ label: "Начислится бонусов:", value: order.bonusesCollected.toLocaleString("ru-RU") });

  return {
    id: order.id,
    customerId: order.customerId,
    issueDate: order.createdAt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Moscow" }),
    statusLabel: labels[order.status] ?? order.status,
    supplier: supplier(),
    buyer: {
      name: c.companyName || c.name || "—",
      lines: [c.inn && `ИНН: ${c.inn}`, c.phone, c.email, c.city, c.address].filter((x): x is string => !!x),
      manager: c.manager || null,
    },
    delivery: deliveryLine(order.deliveryType, order.deliveryAddress),
    items: order.items.map((it) => ({
      name: it.productName,
      variant: it.variantName || null,
      code: it.barcode || null,
      quantity: it.quantity,
      price: it.price,
      total: it.total,
    })),
    totals,
    comment: order.comment || null,
  };
}

