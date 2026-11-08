import { prisma } from "@/lib/prisma";
import { IMPORT_GROUPS } from "../scripts/onec-groups.js";
import { assignCounterparty } from "../scripts/onec-counterparty.js";
import { kickOrderTo1C } from "@/lib/onecOrders";

/**
 * «Менеджер 1С» of a customer chosen in an order: one of the 8 groups the site gets from 1С.
 * In 1С the counterparty goes to that group's folder (a new customer gets a counterparty there, with a
 * contract), on the site the customer is linked to it and gets the group as his manager. A waiting order
 * of the customer goes to 1С right away (it may have been waiting for exactly this counterparty).
 */
export const CUSTOMER_GROUPS: readonly string[] = IMPORT_GROUPS;

export function odataReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ODATA_BASE_URL && env.ODATA_USER && env.ODATA_PASSWORD);
}

export type AssignResult = { ok: true; group: string; created: boolean; moved: boolean; contractCreated: boolean } | { ok: false; error: string };

export async function assignCustomerGroup(customerId: number, group: string): Promise<AssignResult> {
  const g = String(group || "").trim();
  if (!CUSTOMER_GROUPS.includes(g)) return { ok: false, error: "Такой папки нет в списке" };
  if (!odataReady()) return { ok: false, error: "Нет связи с 1С (OData не настроен)" };
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Клиент не найден" };
  let r: { ref: string; created: boolean; moved: boolean; contractCreated: boolean };
  try {
    r = await assignCounterparty(customer, g);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const name = customer.companyName || customer.name || customer.phone || "";
  await prisma.$transaction([
    // another site customer linked to the same counterparty keeps it; this one gets it too
    prisma.customer.update({ where: { id: customerId }, data: { oneCId: r.ref, manager: g, ...(customer.isApproved ? {} : { isApproved: true }) } }),
    prisma.oneCCustomer.upsert({
      where: { oneCId: r.ref },
      update: { manager: g },
      create: { oneCId: r.ref, name, phone: customer.phone, manager: g, priceType: customer.priceType },
    }),
  ]);
  // the customer's orders waiting for 1С — try now
  const waiting = await prisma.order.findMany({ where: { customerId, status: { in: ["payment", "approved"] }, oneCExportedAt: null }, select: { id: true } });
  if (waiting.length) {
    await prisma.order.updateMany({ where: { id: { in: waiting.map((o) => o.id) } }, data: { oneCNextTryAt: null } });
    for (const o of waiting) kickOrderTo1C(o.id);
  }
  console.log(`[1c-customers] клиент ${customerId} → «${g}» (${r.created ? "создан в 1С" : r.moved ? "перенесён" : "уже там"}${r.contractCreated ? ", договор создан" : ""})`);
  return { ok: true, group: g, created: r.created, moved: r.moved, contractCreated: r.contractCreated };
}
