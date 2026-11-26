-- Additive, repeatable deployment. Existing wishlist memberships and quantities are preserved.
ALTER TABLE "WishlistItem" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
ALTER TABLE "WishlistItem" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WishlistItem_customerId_notifiedAt_idx" ON "WishlistItem"("customerId", "notifiedAt");
CREATE TABLE IF NOT EXISTS "ProductWish" (
  "id" SERIAL PRIMARY KEY,
  "customerId" INTEGER NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "comment" TEXT,
  "photoName" TEXT,
  "linkedProductId" INTEGER,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductWish_customerId_nameKey_key" ON "ProductWish"("customerId", "nameKey");
CREATE INDEX IF NOT EXISTS "ProductWish_closed_updatedAt_idx" ON "ProductWish"("closed", "updatedAt");
