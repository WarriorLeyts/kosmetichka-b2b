-- P2-08: indexes declared in schema.prisma but missing in the database (schema drift: the database
-- was never migrated by Prisma). Additive only — no data changes.
CREATE INDEX IF NOT EXISTS "Product_categoryGuid_idx" ON "Product"("categoryGuid");
CREATE INDEX IF NOT EXISTS "Product_brandGuid_idx" ON "Product"("brandGuid");
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");
CREATE INDEX IF NOT EXISTS "Customer_email_idx" ON "Customer"("email");
CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX IF NOT EXISTS "OrderMessage_orderId_source_idx" ON "OrderMessage"("orderId", "source");
CREATE INDEX IF NOT EXISTS "OrderStatusLog_orderId_idx" ON "OrderStatusLog"("orderId");
-- the catalogue's «in stock first» split counts stock > 0 on every page
CREATE INDEX IF NOT EXISTS "Product_stock_idx" ON "Product"("stock");
