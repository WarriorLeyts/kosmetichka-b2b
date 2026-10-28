import { prisma } from "@/lib/prisma";

/**
 * «Ходовые позиции»: Product.salesCount = pieces sold in the last 90 days (all orders except
 * cancelled). The catalogue's default order uses it. Recounted every hour on the server.
 */
export async function recountSales(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "Product" p SET "salesCount" = COALESCE(s.q, 0)
      FROM "Product" p2
      LEFT JOIN (
        SELECT oi."productId", SUM(oi.quantity)::int AS q
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o.status <> 'cancelled' AND o."createdAt" > now() - interval '90 days'
        GROUP BY oi."productId"
      ) s ON s."productId" = p2.id
      WHERE p.id = p2.id AND p."salesCount" IS DISTINCT FROM COALESCE(s.q, 0)`);
  } catch (e) {
    console.error("[sales] recount failed:", e instanceof Error ? e.message : e);
  }
}

const g = globalThis as unknown as { __salesTimer?: ReturnType<typeof setInterval> };

export function startSalesRecount(everyMs = 60 * 60e3): void {
  if (g.__salesTimer) return;
  setTimeout(() => void recountSales(), 30e3);
  g.__salesTimer = setInterval(() => void recountSales(), everyMs);
}
