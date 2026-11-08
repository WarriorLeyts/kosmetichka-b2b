-- Manager accounts: their 1С group («Родитель»). A manager sees only the customers of this group and their orders.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "oneCGroup" TEXT;
