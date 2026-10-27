import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaff, gradeAttempt, readStart, TIME_GRACE_MS, type AnswerMap } from "@/lib/academy";

/** Сдать тест: проверка на сервере, сохранение попытки, результат с разбором (если включён). */
export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const answers: AnswerMap = body?.answers && typeof body.answers === "object" ? body.answers : {};

  const test = await prisma.academyTest.findUnique({
    where: { slug },
    include: {
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
    },
  });
  if (!test || !test.isPublished) return NextResponse.json({ error: "Тест не найден" }, { status: 404 });

  const startedAt = readStart(body?.start, test.id, staff.id);
  if (startedAt === null) {
    return NextResponse.json({ error: "Сессия теста устарела — откройте тест заново" }, { status: 400 });
  }
  const elapsed = Date.now() - startedAt;
  // Просрочено по таймеру — ответы не принимаем (засчитывается как 0)
  const late = test.timeLimitMin != null && elapsed > test.timeLimitMin * 60_000 + TIME_GRACE_MS;

  const result = gradeAttempt(test.questions, late ? {} : answers, test.passScore);

  const attempt = await prisma.academyAttempt.create({
    data: {
      testId: test.id,
      userId: staff.id,
      score: result.score,
      correctCount: result.correctCount,
      total: result.total,
      passed: result.passed,
      details: result.details,
      startedAt: new Date(startedAt),
    },
  });

  return NextResponse.json({
    attemptId: attempt.id,
    score: result.score,
    correctCount: result.correctCount,
    total: result.total,
    passed: result.passed,
    passScore: test.passScore,
    late,
    elapsedMs: elapsed,
    // Разбор ошибок — только если тест это разрешает
    details: test.showAnswers ? result.details : null,
  });
}
