-- Apply before deploying the new server. Existing orders/messages remain unchanged.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serviceStartedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serviceManagerId" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serviceManagerName" TEXT;
ALTER TABLE "OrderMessage" ADD COLUMN IF NOT EXISTS "automatic" BOOLEAN NOT NULL DEFAULT false;
