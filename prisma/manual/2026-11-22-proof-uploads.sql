ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "proofUploadExpected" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "proofUploadCompletedAt" TIMESTAMP(3);
ALTER TABLE "CustomerProof" ADD COLUMN IF NOT EXISTS "uploadId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProof_customerId_uploadId_key" ON "CustomerProof" ("customerId", "uploadId");
