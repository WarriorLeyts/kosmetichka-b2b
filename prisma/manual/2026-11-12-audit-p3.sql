-- Audit P3 (2026-11-12): PERF-02 «Со скидкой» by a flag, SEC-08 staff sessions end on a password change
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hasDiscount" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Product_hasDiscount_idx" ON "Product" ("hasDiscount");
UPDATE "Product" p SET "hasDiscount" = true
  WHERE EXISTS (SELECT 1 FROM "ProductPrice" pp WHERE pp."productGuid" = p.guid AND pp."priceType" = 'discount');
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
