-- «Ходовые» first in the catalogue. Run once:
--   npx prisma db execute --schema prisma/schema.prisma --file catalog-sales-migration.sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "salesCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Product_salesCount_idx" ON "Product"("salesCount" DESC);
-- first count right away (then the server recounts every hour)
UPDATE "Product" p SET "salesCount" = s.q
FROM (
  SELECT oi."productId", SUM(oi.quantity)::int AS q
  FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
  WHERE o.status <> 'cancelled' AND o."createdAt" > now() - interval '90 days'
  GROUP BY oi."productId"
) s
WHERE p.id = s."productId";
