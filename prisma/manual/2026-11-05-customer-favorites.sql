-- Shared favourites per customer (site + apps). Additive, safe to run twice.
CREATE TABLE IF NOT EXISTS "CustomerFavorites" (
  "customerId" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerFavorites_pkey" PRIMARY KEY ("customerId"),
  CONSTRAINT "CustomerFavorites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
