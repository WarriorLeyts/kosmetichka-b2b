-- P2-22: push notifications in the staff app «Косметичка Team» on phones
CREATE TABLE IF NOT EXISTS "StaffPushToken" (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "platform" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffPushToken_token_key" ON "StaffPushToken"("token");
CREATE INDEX IF NOT EXISTS "StaffPushToken_userId_idx" ON "StaffPushToken"("userId");
