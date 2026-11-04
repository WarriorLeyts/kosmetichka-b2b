-- «Неактуальные» sign-ups (Team → Клиенты). Additive, safe to run twice.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "requestStaleAt" TIMESTAMP(3);
