import { prisma } from "@/lib/prisma";
import { isWholesaleRole, maxAccess } from "@/lib/roles";

/**
 * Admin decision on a customer's request for a wholesale price type.
 * approve — grants the requested level and switches the customer to it;
 * reject — the customer sees «Заявка отклонена» and can send a new one.
 * Returns false when there is no pending request.
 */
export async function decideRoleRequest(customerId: number, action: "approve" | "reject"): Promise<boolean> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { roleRequest: true, roleRequestStatus: true, wholesaleAccess: true, priceType: true },
  });
  if (!c || c.roleRequestStatus !== "pending" || !isWholesaleRole(c.roleRequest)) return false;
  await prisma.customer.update({
    where: { id: customerId },
    data:
      action === "approve"
        ? {
            priceType: c.roleRequest,
            wholesaleAccess: maxAccess(maxAccess(c.wholesaleAccess, c.priceType), c.roleRequest),
            roleRequest: null,
            roleRequestStatus: null,
            roleRequestedAt: null,
          }
        : { roleRequestStatus: "rejected" },
  });
  console.log(`[role] customer ${customerId}: request ${c.roleRequest} ${action}d`);
  return true;
}
