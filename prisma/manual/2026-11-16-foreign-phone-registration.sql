-- Additive migration: apply before deploying email registration. Existing phone behaviour is preserved.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phoneUnverified" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "RegistrationEmailCode" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationEmailCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RegistrationEmailCode_email_createdAt_idx" ON "RegistrationEmailCode"("email", "createdAt");
