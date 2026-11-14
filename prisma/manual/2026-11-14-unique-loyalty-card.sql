-- One loyalty card can belong to one site account; NULL stays allowed for every unlinked account.
-- Existing duplicates must be reviewed, never silently detached.
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_loyaltyCard_key" ON "Customer" ("loyaltyCard");
