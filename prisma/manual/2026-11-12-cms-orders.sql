-- Admin panel, orders: log of the tries to send an order to 1С (additive, safe to run twice)
CREATE TABLE IF NOT EXISTS "OneCOrderAttempt" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "outcome" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'auto',
  "by" TEXT,
  "docNumber" TEXT,
  "error" TEXT
);
CREATE INDEX IF NOT EXISTS "OneCOrderAttempt_orderId_at_idx" ON "OneCOrderAttempt"("orderId", "at");
CREATE INDEX IF NOT EXISTS "OneCOrderAttempt_at_idx" ON "OneCOrderAttempt"("at");
