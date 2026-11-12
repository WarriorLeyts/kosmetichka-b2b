-- «Новые поступления» (scripts/import-arrivals.js, lib/arrivals.ts). New table only.
CREATE TABLE IF NOT EXISTS "ProductArrival" (
  "id"             SERIAL NOT NULL,
  "productGuid"    TEXT NOT NULL,
  "place"          TEXT NOT NULL,
  "docRef"         TEXT NOT NULL,
  "docNumber"      TEXT NOT NULL,
  "docDate"        TIMESTAMP(3) NOT NULL,
  "qty"            DOUBLE PRECISION NOT NULL,
  "firstReceiptAt" TIMESTAMP(3),
  CONSTRAINT "ProductArrival_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductArrival_productGuid_fkey" FOREIGN KEY ("productGuid") REFERENCES "Product"("guid") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductArrival_docRef_productGuid_key" ON "ProductArrival"("docRef", "productGuid");
CREATE INDEX IF NOT EXISTS "ProductArrival_docDate_idx" ON "ProductArrival"("docDate");
CREATE INDEX IF NOT EXISTS "ProductArrival_productGuid_idx" ON "ProductArrival"("productGuid");
