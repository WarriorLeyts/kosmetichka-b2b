import { PrismaClient } from "@prisma/client";
import { customerNotified, orderChanged, setOwnerLookup, touchedOrders } from "@/lib/realtime";

/**
 * Every write to an order, its items / chat / change log / status log, or a new customer notification
 * also tells the open screens to reload (lib/realtime.ts) — no route has to remember to do it.
 */
function createClient() {
  const base = new PrismaClient();
  setOwnerLookup(async (orderId) => (await base.order.findUnique({ where: { id: orderId }, select: { customerId: true } }))?.customerId ?? null);
  return base.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        try {
          const t = touchedOrders(model, operation, args, result);
          if (model === "Order") {
            const rows = (Array.isArray(result) ? result : [result]) as { id?: number; customerId?: number }[];
            for (const r of rows) if (r && typeof r.id === "number") orderChanged(r.id, typeof r.customerId === "number" ? r.customerId : null);
          }
          for (const id of t.orderIds) orderChanged(id);
          for (const c of t.customerIds) customerNotified(c);
        } catch {
          /* live updates never break a write */
        }
        return result;
      },
    },
  });
}

type Client = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma: Client | undefined };

export const prisma: Client = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
