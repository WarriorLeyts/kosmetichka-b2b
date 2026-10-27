import { prisma } from "@/lib/prisma";
import { isWholesaleRole, maxAccess } from "@/lib/roles";
import { notify } from "@/lib/notify";

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
  const label = c.roleRequest === "big_wholesale" ? "Крупный опт" : "Опт";
  void notify(customerId, action === "approve"
    ? { kind: "role", title: `Доступ к ценам «${label}» открыт`, body: "Цены в каталоге и корзине уже пересчитаны. Переключаться между розницей и оптом можно в профиле.", link: "/profile" }
    : { kind: "role", title: `Заявка на «${label}» отклонена`, body: "Если есть вопросы, свяжитесь с менеджером.", link: "/profile" });
  return true;
}
