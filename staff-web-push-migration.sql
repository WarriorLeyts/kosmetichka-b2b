-- Browser Web Push for staff (admin website / Team web app). Run once:
--   npx prisma db execute --schema prisma/schema.prisma --file staff-web-push-migration.sql
CREATE TABLE IF NOT EXISTS "StaffWebPushSubscription" (
    "id"         SERIAL NOT NULL,
    "userId"     INTEGER NOT NULL,
    "endpoint"   TEXT NOT NULL,
    "p256dh"     TEXT NOT NULL,
    "auth"       TEXT NOT NULL,
    "userAgent"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffWebPushSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffWebPushSubscription_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffWebPushSubscription_endpoint_key" ON "StaffWebPushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "StaffWebPushSubscription_userId_idx" ON "StaffWebPushSubscription"("userId");
