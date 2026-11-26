import { prisma } from "./prisma";
import { notifyLater } from "./notify";
import { orderChanged } from "./realtime";

export type ServiceActor = { id: number; name: string; login: string };
/** Atomic acknowledgement: concurrent/double clicks cannot create another message or steal ownership. */
export async function startOrderService(id: number, actor: ServiceActor, announce = true) {
  const result = await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) return { kind: "missing" as const };
    if (order.serviceStartedAt) return { kind: order.serviceManagerId === actor.id ? "already" as const : "owned" as const };
    if (!["pending", "approved"].includes(order.status)) return { kind: "stage" as const };
    const changed = await tx.order.updateMany({ where: { id, status: { in: ["pending", "approved"] }, serviceStartedAt: null }, data: { serviceStartedAt: new Date(), serviceManagerId: actor.id, serviceManagerName: actor.name } });
    if (!changed.count) return { kind: "race" as const };
    const text = `Менеджер ${actor.name} проверяет ваш заказ. Уточняем наличие и итоговую сумму. Напишем вам после проверки.`;
    if (announce) await tx.orderMessage.create({ data: { orderId: id, source: "customer", isFromPicker: true, automatic: true, text } });
    await tx.adminAuditLog.create({ data: { userId: actor.id, userName: actor.login, action: "order.service-start", entity: "order", entityId: String(id), summary: "Менеджер взял заказ в работу" } });
    return { kind: "started" as const, customerId: order.customerId, text };
  });
  if (result.kind === "started") {
    // Prisma write hooks can run inside the transaction. Send a fresh hint after commit as well.
    orderChanged(id, result.customerId);
    if (announce) notifyLater(result.customerId, { kind: "order", title: `Заказ №${id} в работе`, body: result.text, link: `/order/${id}` });
  }
  return result;
}
