-- Admin panel (admin.kosmetichka-opt.ru): product content fields, photo order, audit log, pages, banners.
-- Only new columns / tables: nothing existing is changed or removed.
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "descriptionManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "specs" JSONB;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "relatedIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
CREATE INDEX IF NOT EXISTS "Product_hidden_idx" ON "Product"("hidden");

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id"        SERIAL PRIMARY KEY,
  "userId"    INTEGER,
  "userName"  TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "entity"    TEXT NOT NULL,
  "entityId"  TEXT,
  "summary"   TEXT NOT NULL,
  "before"    JSONB,
  "after"     JSONB,
  "ip"        TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_entity_entityId_idx" ON "AdminAuditLog"("entity", "entityId");

CREATE TABLE IF NOT EXISTS "SitePage" (
  "id"             SERIAL PRIMARY KEY,
  "key"            TEXT NOT NULL UNIQUE,
  "title"          TEXT NOT NULL,
  "draft"          JSONB NOT NULL,
  "draftUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "draftUpdatedBy" TEXT,
  "published"      JSONB,
  "publishedAt"    TIMESTAMP(3),
  "publishedBy"    TEXT
);

CREATE TABLE IF NOT EXISTS "SitePageVersion" (
  "id"        SERIAL PRIMARY KEY,
  "pageId"    INTEGER NOT NULL REFERENCES "SitePage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "content"   JSONB NOT NULL,
  "note"      TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SitePageVersion_pageId_createdAt_idx" ON "SitePageVersion"("pageId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "Banner" (
  "id"           SERIAL PRIMARY KEY,
  "title"        TEXT NOT NULL,
  "subtitle"     TEXT,
  "buttonText"   TEXT,
  "link"         TEXT,
  "imageDesktop" TEXT,
  "imageMobile"  TEXT,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "startsAt"     TIMESTAMP(3),
  "endsAt"       TIMESTAMP(3),
  "deletedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
