-- Site orders → «Заказ покупателя» in 1С over OData (lib/onecOrders.ts)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCRef" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCError" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCNextTryAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCSendingAt" TIMESTAMP(3);
