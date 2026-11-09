-- Wholesale orders go to 1С as two documents: the shop («1. Мега Косметичка», СА-…) and the warehouse («0. Склад», СК-…).
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "warehouseQty" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCStockRef" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "oneCStockNumber" TEXT;
