-- Shared cart per customer (site + apps). Additive, safe to run twice.
CREATE TABLE IF NOT EXISTS "CustomerCart" (
  "customerId" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerCart_pkey" PRIMARY KEY ("customerId"),
  CONSTRAINT "CustomerCart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
