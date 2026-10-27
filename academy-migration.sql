-- Migration: тесты для сотрудников (test.kosmetichka-opt.ru → /academy)
-- Идемпотентна: можно запускать повторно. Существующие таблицы не трогает.
-- Применение на сервере (из папки сайта): npx prisma db execute --schema prisma/schema.prisma --file academy-migration.sql

CREATE TABLE IF NOT EXISTS "AcademyTest" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "passScore" INTEGER NOT NULL DEFAULT 80,
    "timeLimitMin" INTEGER,
    "showAnswers" BOOLEAN NOT NULL DEFAULT true,
    "shuffle" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyTest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyQuestion" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "AcademyQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyOption" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AcademyOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AcademyAttempt" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AcademyTest_slug_key" ON "AcademyTest"("slug");
CREATE INDEX IF NOT EXISTS "AcademyQuestion_testId_idx" ON "AcademyQuestion"("testId");
CREATE INDEX IF NOT EXISTS "AcademyOption_questionId_idx" ON "AcademyOption"("questionId");
CREATE INDEX IF NOT EXISTS "AcademyAttempt_testId_finishedAt_idx" ON "AcademyAttempt"("testId", "finishedAt");
CREATE INDEX IF NOT EXISTS "AcademyAttempt_userId_finishedAt_idx" ON "AcademyAttempt"("userId", "finishedAt");

DO $$ BEGIN
  ALTER TABLE "AcademyQuestion" ADD CONSTRAINT "AcademyQuestion_testId_fkey" FOREIGN KEY ("testId") REFERENCES "AcademyTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AcademyOption" ADD CONSTRAINT "AcademyOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AcademyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AcademyAttempt" ADD CONSTRAINT "AcademyAttempt_testId_fkey" FOREIGN KEY ("testId") REFERENCES "AcademyTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AcademyAttempt" ADD CONSTRAINT "AcademyAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Картинка товара в вопросе
ALTER TABLE "AcademyQuestion" ADD COLUMN IF NOT EXISTS "productId" INTEGER;

-- Должность и магазин сотрудника (регистрация в тестах)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "position" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "store" TEXT;
