-- what a wholesaler may order: the shop («1. Мега Косметичка») minus the 12 it keeps + everything else (warehouse)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wholesaleStock" INTEGER NOT NULL DEFAULT 0;
UPDATE "Product" p SET "wholesaleStock" = x.v FROM (
  SELECT p2.id,
    CASE WHEN count(s."warehouseGuid") = 0 THEN greatest(floor(coalesce(p2.stock, 0))::int - 12, 0)
    ELSE greatest(floor(coalesce(sum(s.qty) FILTER (WHERE s."warehouseGuid" = 'bd887c46-1148-11f1-80cf-10ffe0cbb38c'), 0))::int - 12, 0)
       + floor(coalesce(sum(greatest(s.qty, 0)) FILTER (WHERE s."warehouseGuid" <> 'bd887c46-1148-11f1-80cf-10ffe0cbb38c'), 0))::int END AS v
  FROM "Product" p2 LEFT JOIN "ProductWarehouseStock" s ON s."productGuid" = p2.guid
  GROUP BY p2.id
) x WHERE x.id = p.id AND p."wholesaleStock" IS DISTINCT FROM x.v;
CREATE INDEX IF NOT EXISTS "Product_wholesaleStock_idx" ON "Product" ("wholesaleStock");
