-- P2-01: logins made before a password change stop working
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
