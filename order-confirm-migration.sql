-- Customer confirmation of staff changes. Run once:
--   npx prisma db execute --schema prisma/schema.prisma --file order-confirm-migration.sql
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmRequestedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmReminders" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Order_confirmRequestedAt_idx" ON "Order"("confirmRequestedAt");
