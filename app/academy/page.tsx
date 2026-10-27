import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, ListChecks, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStaff, plural } from "@/lib/academy";

export const dynamic = "force-dynamic";

export default async function AcademyHome() {
  const staff = await getStaff();
  if (!staff) redirect("/academy/login");

  const [tests, attempts] = await Promise.all([
    prisma.academyTest.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { _count: { select: { questions: true } } },
    }),
    prisma.academyAttempt.findMany({
      where: { userId: staff.id },
      orderBy: { finishedAt: "desc" },
      select: { testId: true, score: true, passed: true, finishedAt: true },
    }),
  ]);

  // Лучший результат и число попыток по каждому тесту
  const mine = new Map<number, { best: number; passed: boolean; count: number }>();
  for (const a of attempts) {
    const m = mine.get(a.testId) ?? { best: 0, passed: false, count: 0 };
    mine.set(a.testId, { best: Math.max(m.best, a.score), passed: m.passed || a.passed, count: m.count + 1 });
  }
  const passedCount = tests.filter((t) => mine.get(t.id)?.passed).length;

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Тесты</h1>
        {tests.length > 0 && (
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Сдано {passedCount} из {tests.length}
          </p>
        )}
      </div>

      {tests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ListChecks className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-700">Тестов пока нет</p>
          <p className="mt-1 text-sm text-slate-500">Как только руководитель добавит тесты, они появятся здесь.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tests.map((t) => {
            const m = mine.get(t.id);
            const n = t._count.questions;
            return (
              <li key={t.id}>
                <Link
                  href={`/academy/t/${t.slug}`}
                  className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-pink-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-black leading-snug text-slate-900">{t.title}</h2>
                    {m &&
                      (m.passed ? (
                        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" aria-label="Сдан" />
                      ) : (
                        <XCircle className="h-6 w-6 shrink-0 text-rose-400" aria-label="Не сдан" />
                      ))}
                  </div>
                  {t.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{t.description}</p>}
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-xs font-bold text-slate-500">
                    <span>
                      {n} {plural(n, "вопрос", "вопроса", "вопросов")}
                    </span>
                    <span>проходной балл {t.passScore}%</span>
                    {t.timeLimitMin && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {t.timeLimitMin} мин
                      </span>
                    )}
                    {m && (
                      <span className={m.passed ? "text-emerald-600" : "text-rose-500"}>
                        лучший {m.best}% · {m.count} {plural(m.count, "попытка", "попытки", "попыток")}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
