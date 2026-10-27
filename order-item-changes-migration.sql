-- History of order line changes (who added / removed / changed what). Run once:
--   npx prisma db execute --schema prisma/schema.prisma --file order-item-changes-migration.sql
CREATE TABLE IF NOT EXISTS "OrderItemChange" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "orderItemId" INTEGER,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "barcode" TEXT,
    "kind" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "actorName" TEXT,
    "oldQuantity" INTEGER,
    "newQuantity" INTEGER,
    "oldPrice" INTEGER,
    "newPrice" INTEGER,
    "oldVariant" TEXT,
    "newVariant" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItemChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderItemChange_orderId_createdAt_idx" ON "OrderItemChange"("orderId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "OrderItemChange" ADD CONSTRAINT "OrderItemChange_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
