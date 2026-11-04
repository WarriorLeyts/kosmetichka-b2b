-- Wholesale applicants: where they resell + photos / videos proving it (see CustomerProof in schema.prisma)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopType" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopLink" TEXT;

CREATE TABLE IF NOT EXISTS "CustomerProof" (
  "id" SERIAL PRIMARY KEY,
  "customerId" INTEGER NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "file" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerProof_customerId_idx" ON "CustomerProof"("customerId");
