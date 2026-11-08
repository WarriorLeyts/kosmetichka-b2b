import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * What a staff member may see. A manager («manager») works only with the customers of his 1С group
 * (User.oneCGroup = Customer.manager, «Родитель» in 1С) and their orders. Customers without a manager
 * — and the groups nobody owns («Раяна», «Отдел Продаж») — are seen by the administrator only.
 * Retail customers (розница, скидочная карта) belong to the retail account (RETAIL_GROUP), not to the
 * 1С group managers. Admins are not limited. A manager without a group sees nothing.
 */
export type StaffScope = { all: true } | { all: false; group: string | null };

/** 1С groups that are not given to a manager account: their customers are the administrator's */
export const ADMIN_ONLY_GROUPS = ["Раяна", "Отдел Продаж"];

/**
 * Not a 1С group: the account of the retail manager — every retail customer (розница and скидочная
 * карта, whatever their 1С group) and their orders. Group managers get only their wholesale customers.
 */
export const RETAIL_GROUP = "Розничные клиенты";
export const RETAIL_TYPES = ["retail", "discount"];

/** matches no customer (a manager without a group) */
const NOBODY = "\u0000нет группы";

export async function staffScope(s: { id: unknown; role: unknown } | null | undefined): Promise<StaffScope> {
  if (!s || s.role !== "manager") return { all: true };
  const id = Number(s.id);
  const u = Number.isInteger(id) && id > 0 ? await prisma.user.findUnique({ where: { id }, select: { oneCGroup: true } }) : null;
  const group = u?.oneCGroup?.trim() || null;
  return { all: false, group: group && !ADMIN_ONLY_GROUPS.includes(group) ? group : null };
}

/** `where` on Customer for the scope */
export function customerScopeWhere(scope: StaffScope): Prisma.CustomerWhereInput {
  if (scope.all) return {};
  if (scope.group === RETAIL_GROUP) return { priceType: { in: RETAIL_TYPES } };
  return { manager: scope.group ?? NOBODY, NOT: { priceType: { in: RETAIL_TYPES } } };
}

/** `where` on Order for the scope */
export function orderScopeWhere(scope: StaffScope): Prisma.OrderWhereInput {
  return scope.all ? {} : { customer: customerScopeWhere(scope) };
}

/** May this staff member open the order? (missing order = false) */
export async function orderVisible(scope: StaffScope, orderId: number): Promise<boolean> {
  if (scope.all) return true;
  if (!Number.isInteger(orderId) || orderId <= 0) return false;
  return (await prisma.order.count({ where: { id: orderId, ...orderScopeWhere(scope) } })) > 0;
}

/** May this staff member open the customer? */
export async function customerVisible(scope: StaffScope, customerId: number): Promise<boolean> {
  if (scope.all) return true;
  if (!Number.isInteger(customerId) || customerId <= 0) return false;
  return (await prisma.customer.count({ where: { id: customerId, ...customerScopeWhere(scope) } })) > 0;
}

/** Shortcut for routes: the scope of the signed-in staff payload, and whether the order is in it. */
export async function staffSeesOrder(s: { id: unknown; role: unknown } | null | undefined, orderId: number): Promise<boolean> {
  return orderVisible(await staffScope(s), orderId);
}

export async function staffSeesCustomer(s: { id: unknown; role: unknown } | null | undefined, customerId: number): Promise<boolean> {
  return customerVisible(await staffScope(s), customerId);
}

/** 1С groups an admin can give to a manager account (current groups from the 1С export) */
export async function assignableGroups(): Promise<string[]> {
  const rows = await prisma.oneCCustomer.groupBy({ by: ["manager"], where: { manager: { not: null } }, _count: { _all: true } });
  return rows
    .map((r) => r.manager as string)
    .filter((g) => g.trim() && !ADMIN_ONLY_GROUPS.includes(g) && g !== RETAIL_GROUP)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .concat(RETAIL_GROUP);
}
