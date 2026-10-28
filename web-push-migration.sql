-- Browser Web Push subscriptions (site / home-screen web app). Run once:
--   npx prisma db execute --schema prisma/schema.prisma --file web-push-migration.sql
CREATE TABLE IF NOT EXISTS "WebPushSubscription" (
    "id"         SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "endpoint"   TEXT NOT NULL,
    "p256dh"     TEXT NOT NULL,
    "auth"       TEXT NOT NULL,
    "userAgent"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WebPushSubscription_customerId_fkey" FOREIGN KEY ("customerId")
        REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "WebPushSubscription_customerId_idx" ON "WebPushSubscription"("customerId");
