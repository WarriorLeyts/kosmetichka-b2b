import { PrismaClient } from "@prisma/client";
import { emitForOperation, setOwnerLookup } from "@/lib/realtime";

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
          emitForOperation(model, operation, args, result);
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
