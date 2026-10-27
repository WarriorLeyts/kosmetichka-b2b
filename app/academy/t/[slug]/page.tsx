import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStaff, signStart } from "@/lib/academy";
import TestRunner, { type RunnerQuestion } from "@/components/academy/TestRunner";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await prisma.academyTest.findUnique({ where: { slug }, select: { title: true } });
  return { title: t?.title ?? "Тест" };
}

/** Подписанный момент начала — сервер проверит его при сдаче. */
function startToken(testId: number, userId: number) {
  return signStart(testId, userId, Date.now());
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function TestPage({ params }: Props) {
  const { slug } = await params;
  const staff = await getStaff();
  if (!staff) redirect(`/academy/login?next=/academy/t/${encodeURIComponent(slug)}`);

  const test = await prisma.academyTest.findUnique({
    where: { slug },
    include: {
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
    },
  });
  if (!test || !test.isPublished) notFound();

  // В браузер — без признака правильности; «несколько ответов» подсказываем, иначе вопрос нечестный
  let questions: RunnerQuestion[] = test.questions.map((q) => ({
    id: q.id,
    text: q.text,
    multiple: q.options.filter((o) => o.isCorrect).length > 1,
    options: (test.shuffle ? shuffled(q.options) : q.options).map((o) => ({ id: o.id, text: o.text })),
  }));
  if (test.shuffle) questions = shuffled(questions);

  return (
    <TestRunner
      slug={test.slug}
      title={test.title}
      description={test.description}
      passScore={test.passScore}
      timeLimitMin={test.timeLimitMin}
      questions={questions}
      start={startToken(test.id, staff.id)}
    />
  );
}
