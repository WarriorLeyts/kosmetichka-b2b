import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canSeeResults, formatDuration, getStaff, ROLE_NAMES } from "@/lib/academy";
import { STORES } from "@/lib/academy-register";

export const dynamic = "force-dynamic";
export const metadata = { title: "Результаты сотрудников" };

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store: storeParam } = await searchParams;
  const store = storeParam && STORES.includes(storeParam) ? storeParam : null;
  const staff = await getStaff();
  if (!staff) redirect("/academy/login?next=/academy/results");
  if (!canSeeResults(staff.role)) redirect("/academy");

  const [tests, users, attempts] = await Promise.all([
    prisma.academyTest.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, title: true, isPublished: true },
    }),
    prisma.user.findMany({
      where: store ? { store } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true, login: true, role: true, position: true, store: true },
    }),
    prisma.academyAttempt.findMany({
      where: store ? { user: { store } } : undefined,
      orderBy: { finishedAt: "desc" },
      select: {
        id: true,
        testId: true,
        userId: true,
        score: true,
        passed: true,
        correctCount: true,
        total: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
  ]);

  // Лучший результат каждого сотрудника по каждому тесту
  const best = new Map<string, { score: number; passed: boolean; count: number; attemptId: number }>();
  for (const a of attempts) {
    const k = `${a.userId}:${a.testId}`;
    const b = best.get(k);
    if (!b) best.set(k, { score: a.score, passed: a.passed, count: 1, attemptId: a.id });
    else {
      b.count++;
      if (a.score > b.score) Object.assign(b, { score: a.score, passed: a.passed, attemptId: a.id });
      b.passed ||= a.passed;
    }
  }

  const testById = new Map(tests.map((t) => [t.id, t]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const shownTests = tests.filter((t) => t.isPublished || attempts.some((a) => a.testId === t.id));

  return (
    <div className="space-y-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-900">Результаты сотрудников</h1>
        <nav className="flex flex-wrap gap-1.5 text-sm font-bold" aria-label="Магазин">
          {[null, ...STORES].map((s) => (
            <Link
              key={s ?? "all"}
              href={s ? `/academy/results?store=${encodeURIComponent(s)}` : "/academy/results"}
              aria-current={s === store ? "page" : undefined}
              className={`rounded-xl px-3 py-1.5 ${
                s === store ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-pink-300"
              }`}
            >
              {s ?? "Все магазины"}
            </Link>
          ))}
        </nav>
      </div>

      {shownTests.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center font-bold text-slate-600">
          Тестов пока нет.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-900">Сводка — лучший результат</h2>
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-black uppercase text-slate-500">
                  <th className="sticky left-0 bg-white px-4 py-3">Сотрудник</th>
                  {shownTests.map((t) => (
                    <th key={t.id} className="max-w-48 px-3 py-3 normal-case">
                      {t.title}
                    </th>
                  ))}
                  <th className="px-3 py-3">Сдано</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const passed = shownTests.filter((t) => best.get(`${u.id}:${t.id}`)?.passed).length;
                  return (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0">
                      <td className="sticky left-0 bg-white px-4 py-2.5">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500">
                          {[u.position ?? ROLE_NAMES[u.role] ?? u.role, u.store, u.login].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      {shownTests.map((t) => {
                        const b = best.get(`${u.id}:${t.id}`);
                        return (
                          <td key={t.id} className="px-3 py-2.5">
                            {b ? (
                              <Link
                                href={`/academy/results/${b.attemptId}`}
                                className={`inline-block rounded-xl px-2.5 py-1 font-black tabular-nums ${
                                  b.passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                                }`}
                                title={`Попыток: ${b.count}`}
                              >
                                {b.score}%
                              </Link>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 font-bold tabular-nums text-slate-700">
                        {passed}/{shownTests.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-900">Последние попытки</h2>
        {attempts.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">
            {store ? `Сотрудники магазина «${store}» ещё не проходили тесты.` : "Пока никто не проходил тесты."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-black uppercase text-slate-500">
                  <th className="px-4 py-3">Когда</th>
                  <th className="px-3 py-3">Сотрудник</th>
                  <th className="px-3 py-3">Тест</th>
                  <th className="px-3 py-3">Результат</th>
                  <th className="px-3 py-3">Время</th>
                </tr>
              </thead>
              <tbody>
                {attempts.slice(0, 100).map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{dt.format(a.finishedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900">{userById.get(a.userId)?.name ?? "—"}</div>
                      {userById.get(a.userId)?.store && (
                        <div className="text-xs text-slate-500">{userById.get(a.userId)?.store}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{testById.get(a.testId)?.title ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/academy/results/${a.id}`}
                        className={`font-black tabular-nums underline-offset-2 hover:underline ${
                          a.passed ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {a.score}% · {a.correctCount}/{a.total}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">
                      {formatDuration(a.finishedAt.getTime() - a.startedAt.getTime())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
