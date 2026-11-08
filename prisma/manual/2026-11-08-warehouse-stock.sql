-- Stock per warehouse from 1C («Разбивать остатки по складам» in the 1C integration). Staff only:
-- customers keep seeing Product.stock (the total). Filled by scripts/import-prices.js.
CREATE TABLE IF NOT EXISTS "Warehouse" (
  "guid"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("guid")
);

CREATE TABLE IF NOT EXISTS "ProductWarehouseStock" (
  "productGuid"   TEXT NOT NULL,
  "warehouseGuid" TEXT NOT NULL,
  "qty"           DOUBLE PRECISION NOT NULL,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductWarehouseStock_pkey" PRIMARY KEY ("productGuid", "warehouseGuid"),
  CONSTRAINT "ProductWarehouseStock_productGuid_fkey" FOREIGN KEY ("productGuid") REFERENCES "Product"("guid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductWarehouseStock_warehouseGuid_fkey" FOREIGN KEY ("warehouseGuid") REFERENCES "Warehouse"("guid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductWarehouseStock_warehouseGuid_idx" ON "ProductWarehouseStock"("warehouseGuid");
