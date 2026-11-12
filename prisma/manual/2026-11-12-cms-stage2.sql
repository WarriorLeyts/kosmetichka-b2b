-- Admin panel, stage 2 (products): new columns and tables only.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "seoSource" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "canonicalUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "features" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "usage" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "composition" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "skinType" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brandManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryGuid1C" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brandGuid1C" TEXT;
-- the values 1C sent so far
UPDATE "Product" SET "categoryGuid1C" = "categoryGuid", "brandGuid1C" = "brandGuid" WHERE "categoryGuid1C" IS NULL AND "brandGuid1C" IS NULL;
-- SEO typed in the admin panel so far counts as manual
UPDATE "Product" SET "seoSource" = 'manual' WHERE "seoSource" IS NULL AND ("seoTitle" IS NOT NULL OR "seoDescription" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "Product_slug_idx" ON "Product"("slug");

ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "alt" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "original" TEXT;

CREATE TABLE IF NOT EXISTS "CmsJob" (
  "id"          SERIAL PRIMARY KEY,
  "type"        TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'queued',
  "title"       TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "total"       INTEGER NOT NULL DEFAULT 0,
  "done"        INTEGER NOT NULL DEFAULT 0,
  "failed"      INTEGER NOT NULL DEFAULT 0,
  "result"      JSONB,
  "errors"      JSONB,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "createdBy"   TEXT NOT NULL,
  "userId"      INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"   TIMESTAMP(3),
  "finishedAt"  TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CmsJob_status_createdAt_idx" ON "CmsJob"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "CmsBulkOperation" (
  "id"        SERIAL PRIMARY KEY,
  "type"      TEXT NOT NULL,
  "summary"   TEXT NOT NULL,
  "count"     INTEGER NOT NULL,
  "changes"   JSONB NOT NULL,
  "userName"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt"  TIMESTAMP(3),
  "undoneBy"  TEXT
);
CREATE INDEX IF NOT EXISTS "CmsBulkOperation_createdAt_idx" ON "CmsBulkOperation"("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "CmsSetting" (
  "key"       TEXT PRIMARY KEY,
  "value"     JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT
);
