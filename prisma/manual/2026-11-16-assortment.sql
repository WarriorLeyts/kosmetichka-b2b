DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'assortmentEnabled') THEN
    ALTER TABLE "Product" ADD COLUMN "assortmentEnabled" BOOLEAN NOT NULL DEFAULT false;
    UPDATE "Product" SET "assortmentEnabled" = true WHERE EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = "Product".id);
  END IF;
  ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "available" BOOLEAN NOT NULL DEFAULT true;
END $$;
