-- P2-08: search «contains» (ILIKE '%word%') by name / article / barcode without a full scan
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_article_trgm_idx" ON "Product" USING gin ("article" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_barcode_trgm_idx" ON "Product" USING gin ("barcode" gin_trgm_ops);
