import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, EyeOff, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { plural, requireStaffEditor } from "@/lib/academy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Редактор тестов" };

export default async function ManageTests({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (!(await requireStaffEditor())) redirect("/academy");
  const sp = await searchParams;

  const tests = await prisma.academyTest.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      passScore: true,
      timeLimitMin: true,
      isPublished: true,
      updatedAt: true,
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Редактор тестов</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Создавайте тесты и вопросы. К вопросу можно привязать товар по коду номенклатуры — сотрудник увидит его фото.
          </p>
        </div>
        <Link
          href="/academy/manage/new"
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 px-5 text-sm font-black text-white"
        >
          <Plus className="h-4 w-4" /> Новый тест
        </Link>
      </div>

      {sp.deleted && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Тест удалён.</div>}

      {tests.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center font-bold text-slate-500">
          Тестов пока нет
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {tests.map((t) => (
            <li key={t.id}>
              <Link href={`/academy/manage/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-pink-50/50">
                <span className="min-w-0 flex-1 font-black text-slate-900">
                  {t.title}
                  {!t.isPublished && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-[11px] font-bold text-slate-500">
                      <EyeOff className="h-3 w-3" /> скрыт
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap gap-x-4 text-xs font-bold text-slate-500">
                  <span>
                    {t._count.questions} {plural(t._count.questions, "вопрос", "вопроса", "вопросов")}
                  </span>
                  <span>от {t.passScore}%</span>
                  {t.timeLimitMin && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {t.timeLimitMin} мин
                    </span>
                  )}
                  <span>
                    {t._count.attempts} {plural(t._count.attempts, "прохождение", "прохождения", "прохождений")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
