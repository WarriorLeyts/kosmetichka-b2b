import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canSeeResults, formatDuration, getStaffFresh as getStaff, type AttemptDetail } from "@/lib/academy";
import { Review } from "@/components/academy/TestRunner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Разбор попытки" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaff();
  if (!staff) redirect(`/academy/login?next=/academy/results/${encodeURIComponent(id)}`);
  if (!canSeeResults(staff.role)) redirect("/academy");

  const attemptId = Number(id);
  if (!Number.isSafeInteger(attemptId)) notFound();

  const a = await prisma.academyAttempt.findUnique({
    where: { id: attemptId },
    include: { user: { select: { name: true, login: true, position: true, store: true } }, test: { select: { title: true, passScore: true } } },
  });
  if (!a) notFound();

  const when = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(a.finishedAt);

  return (
    <div className="space-y-6 pt-4">
      <div>
        <Link href="/academy/results" className="text-sm font-bold text-slate-500 hover:text-pink-500">
          ← Все результаты
        </Link>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{a.test.title}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {a.user.name} ({[a.user.position, a.user.store, a.user.login].filter(Boolean).join(", ")}) · {when} · {formatDuration(a.finishedAt.getTime() - a.startedAt.getTime())}
        </p>
        <p className={`mt-2 text-lg font-black ${a.passed ? "text-emerald-600" : "text-rose-600"}`}>
          {a.score}% · {a.correctCount} из {a.total} · {a.passed ? "сдан" : "не сдан"}
          <span className="ml-2 text-sm font-bold text-slate-500">(нужно {a.test.passScore}%)</span>
        </p>
      </div>
      <Review details={a.details as unknown as AttemptDetail[]} />
    </div>
  );
}
