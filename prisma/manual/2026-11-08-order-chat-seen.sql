-- The customer's «read» mark of the order chat, shared by all his devices (was kept on each phone).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerChatSeenAt" TIMESTAMP(3);
