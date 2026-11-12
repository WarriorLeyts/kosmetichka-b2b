-- All barcodes of a product from 1С («Штрихкоды номенклатуры» over OData, scripts/import-barcodes.js).
-- New table only; Product.barcode (the one of the exchange) stays as it is.
CREATE TABLE IF NOT EXISTS "ProductBarcode" (
  "barcode"     TEXT NOT NULL,
  "productGuid" TEXT NOT NULL,
  "unitRef"     TEXT,
  "unitName"    TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("barcode", "productGuid"),
  CONSTRAINT "ProductBarcode_productGuid_fkey" FOREIGN KEY ("productGuid") REFERENCES "Product"("guid") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProductBarcode_productGuid_idx" ON "ProductBarcode"("productGuid");
