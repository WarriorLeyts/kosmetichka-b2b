-- New order flow: the customer is asked to confirm only when the collected order is sent «На проверке».
-- Requests left from the old flow (staff edits before / during assembly) are dropped — they will be
-- asked again when the manager sends the order to the customer.
UPDATE "Order" SET "confirmRequestedAt" = NULL WHERE "status" IN ('pending', 'approved', 'assembly') AND "confirmRequestedAt" IS NOT NULL;
